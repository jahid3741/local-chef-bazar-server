require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: [process.env.CLIENT_URL],
  credentials: true,
  optionsSuccessStatus: 200,
};

// middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// mongodb uri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.enrgmwd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verify token middleware
function verifyToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (error) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    req.user = decoded;
    next();
  });
}

// verify chef middleware
async function verifyChef(req, res, next) {
  const email = req.user.email;

  const user = await req.app.locals.usersCollection.findOne({ email });

  if (user?.role !== "chef") {
    return res.status(403).send({ message: "Chef access only" });
  }

  if (user?.status === "fraud") {
    return res
      .status(403)
      .send({ message: "Fraud chef cannot perform this action" });
  }

  req.dbUser = user;

  next();
}

// verify admin middleware
async function verifyAdmin(req, res, next) {
  const email = req.user.email;

  const user = await req.app.locals.usersCollection.findOne({ email });

  if (user?.role !== "admin") {
    return res.status(403).send({ message: "Admin access only" });
  }

  next();
}

async function run() {
  try {
    // mongodb connect
    await client.connect();
    await client.db("admin").command({ ping: 1 });

    console.log("MongoDB Connected Successfully");

    const database = client.db("localChefBazaarDB");

    // collections
    const usersCollection = database.collection("users");
    const mealsCollection = database.collection("meals");
    const reviewsCollection = database.collection("reviews");
    const favoritesCollection = database.collection("favorites");
    const ordersCollection = database.collection("orders");
    const requestsCollection = database.collection("requests");
    const paymentsCollection = database.collection("payments");

    // make collection globally available
    app.locals.usersCollection = usersCollection;

    // jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // logout api
    app.post("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          maxAge: 0,
        })
        .send({ success: true });
    });

    // save user
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;

      const filter = { email };

      const options = { upsert: true };

      const updatedUser = {
        $setOnInsert: {
          name: user.name,
          email: user.email,
          image: user.image,
          address: user.address,
          role: "user",
          status: "active",
          createdAt: new Date().toISOString(),
        },
      };

      const result = await usersCollection.updateOne(
        filter,
        updatedUser,
        options,
      );

      res.send(result);
    });

    // get all users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/users/role/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const user = await usersCollection.findOne({ email });

      res.send({
        role: user?.role || "user",
        status: user?.status || "active",
        chefId: user?.chefId || null,
      });
    });

    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // make fraud
    app.patch(
      "/users/:email/fraud",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;

        const targetUser = await usersCollection.findOne({ email });

        if (!targetUser) {
          return res.status(404).send({ message: "User not found" });
        }

        if (targetUser.role === "admin") {
          return res
            .status(400)
            .send({ message: "Admin cannot be marked as fraud" });
        }

        if (targetUser.status === "fraud") {
          return res.status(400).send({ message: "User already fraud" });
        }

        const result = await usersCollection.updateOne(
          { email },
          {
            $set: {
              status: "fraud",
            },
          },
        );

        res.send(result);
      },
    );

    // create meal
    app.post("/meals", verifyToken, verifyChef, async (req, res) => {
      const meal = req.body;

      if (req.user.email !== meal.userEmail) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const newMeal = {
        foodName: meal.foodName,
        chefName: meal.chefName,
        foodImage: meal.foodImage,
        price: Number(meal.price),
        rating: Number(meal.rating) || 0,

        ingredients: Array.isArray(meal.ingredients)
          ? meal.ingredients
          : typeof meal.ingredients === "string"
            ? meal.ingredients.split(",").map((item) => item.trim())
            : [],

        deliveryArea: meal.deliveryArea,
        estimatedDeliveryTime: meal.estimatedDeliveryTime,
        chefExperience: meal.chefExperience,
        chefId: req.dbUser.chefId,
        userEmail: meal.userEmail,
        createdAt: new Date().toISOString(),
      };

      const result = await mealsCollection.insertOne(newMeal);

      res.send(result);
    });

    // get all meals
    app.get("/meals", async (req, res) => {
      const sort = req.query.sort;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      let sortOption = {};

      if (sort === "asc") {
        sortOption = { price: 1 };
      }

      if (sort === "desc") {
        sortOption = { price: -1 };
      }

      const meals = await mealsCollection
        .find()
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await mealsCollection.countDocuments();

      res.send({
        meals,
        total,
        page,
        limit,
      });
    });

    // get single meal
    app.get("/meals/:id", async (req, res) => {
      const id = req.params.id;

      const result = await mealsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    // update meal
    app.patch("/meals/:id", verifyToken, verifyChef, async (req, res) => {
      const id = req.params.id;

      const updatedData = req.body;

      const result = await mealsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: updatedData,
        },
      );

      res.send(result);
    });

    // delete meal
    app.delete("/meals/:id", verifyToken, verifyChef, async (req, res) => {
      const id = req.params.id;

      const result = await mealsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    // create request
    app.post("/requests", verifyToken, async (req, res) => {
      const request = req.body;

      if (req.user.email !== request.userEmail) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const existingRequest = await requestsCollection.findOne({
        userEmail: request.userEmail,
        requestType: request.requestType,
        requestStatus: "pending",
      });

      if (existingRequest) {
        return res.status(409).send({
          message: "Request already pending",
        });
      }

      const newRequest = {
        userName: request.userName,
        userEmail: request.userEmail,
        requestType: request.requestType,
        requestStatus: "pending",
        requestTime: new Date().toISOString(),
      };

      const result = await requestsCollection.insertOne(newRequest);

      res.send(result);
    });

    // get requests
    app.get("/requests", verifyToken, verifyAdmin, async (req, res) => {
      const result = await requestsCollection
        .find()
        .sort({ requestTime: -1 })
        .toArray();

      res.send(result);
    });

    // approve request
    app.patch(
      "/requests/:id/approve",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;

        const request = await requestsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!request) {
          return res.status(404).send({
            message: "Request not found",
          });
        }

        if (request.requestStatus !== "pending") {
          return res.status(400).send({
            message: "Request already handled",
          });
        }

        const updateUser = {
          role: request.requestType,
        };

        if (request.requestType === "chef") {
          updateUser.chefId = `chef-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        const userResult = await usersCollection.updateOne(
          { email: request.userEmail },
          {
            $set: updateUser,
          },
        );

        const requestResult = await requestsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              requestStatus: "approved",
            },
          },
        );

        res.send({
          userResult,
          requestResult,
        });
      },
    );

    // reject request
    app.patch(
      "/requests/:id/reject",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;

        const result = await requestsCollection.updateOne(
          {
            _id: new ObjectId(id),
            requestStatus: "pending",
          },
          {
            $set: {
              requestStatus: "rejected",
            },
          },
        );

        res.send(result);
      },
    );

    // home route
    app.get("/", (req, res) => {
      res.send("LocalChefBazaar server is running");
    });

    // health route
    app.get("/health", async (req, res) => {
      res.send({
        status: "ok",
        message: "Server and database are ready",
      });
    });
    // add review
    app.post("/reviews", verifyToken, async (req, res) => {
      const review = req.body;

      if (req.user.email !== review.reviewerEmail) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const meal = await mealsCollection.findOne({
        _id: new ObjectId(review.foodId),
      });

      if (!meal) {
        return res.status(404).send({ message: "Meal not found" });
      }

      const newReview = {
        foodId: review.foodId,
        mealName: meal.foodName,
        reviewerName: review.reviewerName,
        reviewerEmail: review.reviewerEmail,
        reviewerImage: review.reviewerImage,
        rating: Number(review.rating),
        comment: review.comment,
        date: new Date().toISOString(),
      };

      const result = await reviewsCollection.insertOne(newReview);
      res.send(result);
    });
    // get reviews by meal
    app.get("/reviews/meal/:foodId", async (req, res) => {
      const foodId = req.params.foodId;

      const result = await reviewsCollection
        .find({ foodId })
        .sort({ date: -1 })
        .toArray();

      res.send(result);
    });
    // get my reviews
    app.get("/reviews/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const result = await reviewsCollection
        .find({ reviewerEmail: email })
        .sort({ date: -1 })
        .toArray();

      res.send(result);
    });
    // update review
    app.patch("/reviews/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedReview = req.body;

      const review = await reviewsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!review) {
        return res.status(404).send({ message: "Review not found" });
      }

      if (review.reviewerEmail !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const result = await reviewsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            rating: Number(updatedReview.rating),
            comment: updatedReview.comment,
            updatedAt: new Date().toISOString(),
          },
        },
      );

      res.send(result);
    });
    // delete review
    app.delete("/reviews/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const review = await reviewsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!review) {
        return res.status(404).send({ message: "Review not found" });
      }

      if (review.reviewerEmail !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const result = await reviewsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });
    // add favorite
    app.post("/favorites", verifyToken, async (req, res) => {
      const favorite = req.body;

      if (req.user.email !== favorite.userEmail) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const meal = await mealsCollection.findOne({
        _id: new ObjectId(favorite.mealId),
      });

      if (!meal) {
        return res.status(404).send({ message: "Meal not found" });
      }

      const existingFavorite = await favoritesCollection.findOne({
        userEmail: favorite.userEmail,
        mealId: favorite.mealId,
      });

      if (existingFavorite) {
        return res.status(409).send({ message: "Meal already in favorites" });
      }

      const newFavorite = {
        userEmail: favorite.userEmail,
        mealId: favorite.mealId,
        mealName: meal.foodName,
        chefId: meal.chefId,
        chefName: meal.chefName,
        price: meal.price,
        addedTime: new Date().toISOString(),
      };

      const result = await favoritesCollection.insertOne(newFavorite);
      res.send(result);
    });
    app.get("/favorites/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const result = await favoritesCollection
        .find({ userEmail: email })
        .sort({ addedTime: -1 })
        .toArray();

      res.send(result);
    });
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`LocalChefBazaar server is running on port ${port}`);
});
