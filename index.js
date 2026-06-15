require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE);
const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://local-chef-bazar-jahid.netlify.app",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

// middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// mongodb uri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.enrgmwd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// 1. Create the client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// 2. Define collections globally
const database = client.db("localChefBazaarDB");
const usersCollection = database.collection("users");
const mealsCollection = database.collection("meals");
const reviewsCollection = database.collection("reviews");
const favoritesCollection = database.collection("favorites");
const ordersCollection = database.collection("orders");
const requestsCollection = database.collection("requests");
const paymentsCollection = database.collection("payments");

function isValidObjectId(id) {
  return ObjectId.isValid(id);
}

// SECURITY MIDDLEWARES

function verifyToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res
      .status(401)
      .send({ message: "Unauthorized access - No Token Found" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (error) {
      return res
        .status(403)
        .send({ message: "Forbidden access - Invalid or Expired Token" });
    }
    req.user = decoded;
    next();
  });
}

async function verifyChef(req, res, next) {
  const email = req.user.email;
  const user = await usersCollection.findOne({ email });

  if (user?.role !== "chef") {
    return res
      .status(403)
      .send({ message: "Forbidden access - Chef access only" });
  }

  if (user?.status === "fraud") {
    return res.status(403).send({
      message: "Forbidden access - Fraud chef cannot perform this action",
    });
  }

  req.dbUser = user;
  next();
}

async function verifyAdmin(req, res, next) {
  const email = req.user.email;
  const user = await usersCollection.findOne({ email });

  if (user?.role !== "admin") {
    return res
      .status(403)
      .send({ message: "Forbidden access - Admin access only" });
  }

  next();
}

async function verifyActiveUser(req, res, next) {
  const email = req.user.email;
  const user = await usersCollection.findOne({ email });

  if (!user) {
    return res.status(404).send({ message: "User not found" });
  }

  if (user.status === "fraud") {
    return res.status(403).send({
      message: "Forbidden access - Fraud user cannot perform this action",
    });
  }

  req.dbUser = user;
  next();
}

//  ROUTES

// jwt api
app.post("/jwt", async (req, res) => {
  const user = req.body;
  const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res
    .cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    })
    .send({ success: true });
});

// logout api
app.post("/logout", async (req, res) => {
  res
    .clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
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

  const result = await usersCollection.updateOne(filter, updatedUser, options);
  res.send(result);
});

// get all users
app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  const result = await usersCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(result);
});

// get user role
app.get("/users/role/:email", verifyToken, async (req, res) => {
  const email = req.params.email;

  if (req.user.email.toLowerCase() !== email.toLowerCase()) {
    return res
      .status(403)
      .send({ message: "Forbidden access - Email mismatch" });
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

  if (req.user.email.toLowerCase() !== email.toLowerCase()) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const result = await usersCollection.findOne({ email });
  res.send(result);
});

// make fraud
app.patch("/users/:email/fraud", verifyToken, verifyAdmin, async (req, res) => {
  const email = req.params.email;
  const targetUser = await usersCollection.findOne({ email });

  if (!targetUser) return res.status(404).send({ message: "User not found" });
  if (targetUser.role === "admin")
    return res.status(400).send({ message: "Admin cannot be marked as fraud" });
  if (targetUser.status === "fraud")
    return res.status(400).send({ message: "User already fraud" });

  const result = await usersCollection.updateOne(
    { email },
    { $set: { status: "fraud" } },
  );

  res.send(result);
});

// make chef
app.patch(
  "/users/:email/make-chef",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const email = req.params.email;
    const targetUser = await usersCollection.findOne({ email });

    if (!targetUser) return res.status(404).send({ message: "User not found" });

    const chefId =
      targetUser.chefId || `chef-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await usersCollection.updateOne(
      { email },
      { $set: { role: "chef", chefId } },
    );

    res.send(result);
  },
);

// make admin
app.patch(
  "/users/:email/make-admin",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const email = req.params.email;
    const targetUser = await usersCollection.findOne({ email });

    if (!targetUser) return res.status(404).send({ message: "User not found" });
    if (targetUser.role === "admin")
      return res.status(400).send({ message: "User already admin" });

    const result = await usersCollection.updateOne(
      { email },
      { $set: { role: "admin" } },
    );

    res.send(result);
  },
);
// create meal
app.post("/meals", verifyToken, verifyChef, async (req, res) => {
  try {
    const meal = req.body;

    const newMeal = {
      foodName: meal.foodName,
      chefName: meal.chefName,
      foodImage: meal.foodImage,
      price: Number(meal.price),
      rating: 0,
      ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
      deliveryArea: meal.deliveryArea,
      estimatedDeliveryTime: meal.estimatedDeliveryTime,
      chefExperience: meal.chefExperience,

      userEmail: req.user.email,
      chefId: req.dbUser.chefId,

      createdAt: new Date().toISOString(),
    };

    const result = await mealsCollection.insertOne(newMeal);

    res.status(201).send({
      insertedId: result.insertedId,
      message: "Meal created successfully",
    });
  } catch (error) {
    console.error("Create meal error:", error);

    res.status(500).send({
      message: "Failed to create meal",
      error: error.message,
    });
  }
});

// get all meals
app.get("/meals", async (req, res) => {
  const sort = req.query.sort;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 0;

  const skip = (page - 1) * limit;
  let sortOption = {};
  if (sort === "asc") sortOption = { price: 1 };
  if (sort === "desc") sortOption = { price: -1 };

  let query = mealsCollection.find();
  if (Object.keys(sortOption).length > 0) query = query.sort(sortOption);
  if (limit > 0) query = query.skip(skip).limit(limit);

  const meals = await query.toArray();
  const total = await mealsCollection.countDocuments();

  res.send({ meals, total, page, limit });
});

// get chef meals
app.get("/meals/chef/:email", verifyToken, verifyChef, async (req, res) => {
  const email = req.params.email;

  if (req.user.email !== email) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const result = await mealsCollection
    .find({ userEmail: email })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

// get single meal
app.get("/meals/:id", async (req, res) => {
  const id = req.params.id;
  if (!isValidObjectId(id)) {
    return res.status(400).send({ message: "Invalid meal id" });
  }

  const result = await mealsCollection.findOne({ _id: new ObjectId(id) });
  if (!result) {
    return res.status(404).send({ message: "Meal not found" });
  }

  res.send(result);
});

// update meal
app.patch("/meals/:id", verifyToken, verifyChef, async (req, res) => {
  const id = req.params.id;
  const updatedData = req.body;

  if (!isValidObjectId(id))
    return res.status(400).send({ message: "Invalid meal id" });

  const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
  if (!meal) return res.status(404).send({ message: "Meal not found" });
  if (meal.userEmail !== req.user.email)
    return res.status(403).send({ message: "Forbidden access" });

  delete updatedData._id;
  delete updatedData.chefId;
  delete updatedData.userEmail;
  delete updatedData.createdAt;

  const result = await mealsCollection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        ...updatedData,
        price: Number(updatedData.price),
        rating: Number(updatedData.rating),
        updatedAt: new Date().toISOString(),
      },
    },
  );

  res.send(result);
});

// delete meal
app.delete("/meals/:id", verifyToken, verifyChef, async (req, res) => {
  const id = req.params.id;

  if (!isValidObjectId(id))
    return res.status(400).send({ message: "Invalid meal id" });
  const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });

  if (!meal) return res.status(404).send({ message: "Meal not found" });
  if (meal.userEmail !== req.user.email)
    return res.status(403).send({ message: "Forbidden access" });

  const result = await mealsCollection.deleteOne({ _id: new ObjectId(id) });
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

  if (existingRequest)
    return res.status(409).send({ message: "Request already pending" });

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
    const request = await requestsCollection.findOne({ _id: new ObjectId(id) });

    if (!request) return res.status(404).send({ message: "Request not found" });
    if (request.requestStatus !== "pending")
      return res.status(400).send({ message: "Request already handled" });

    const existingUser = await usersCollection.findOne({
      email: request.userEmail,
    });
    const updateUser = {};

    if (request.requestType === "chef") {
      updateUser.role = "chef";
      updateUser.chefId =
        existingUser?.chefId ||
        `chef-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    if (request.requestType === "admin") {
      updateUser.role = "admin";
    }

    const userResult = await usersCollection.updateOne(
      { email: request.userEmail },
      { $set: updateUser },
    );

    const requestResult = await requestsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { requestStatus: "approved" } },
    );

    res.send({ userResult, requestResult });
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
      { _id: new ObjectId(id), requestStatus: "pending" },
      { $set: { requestStatus: "rejected" } },
    );

    res.send(result);
  },
);

// health route
app.get("/health", async (req, res) => {
  res.send({ status: "ok", message: "Server and database are ready" });
});

// add review
app.post("/reviews", verifyToken, async (req, res) => {
  const review = req.body;
  if (req.user.email !== review.reviewerEmail)
    return res.status(403).send({ message: "Forbidden access" });

  const meal = await mealsCollection.findOne({
    _id: new ObjectId(review.foodId),
  });
  if (!meal) return res.status(404).send({ message: "Meal not found" });

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
  if (req.user.email !== email)
    return res.status(403).send({ message: "Forbidden access" });

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

  const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });
  if (!review) return res.status(404).send({ message: "Review not found" });
  if (review.reviewerEmail !== req.user.email)
    return res.status(403).send({ message: "Forbidden access" });

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
  const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });

  if (!review) return res.status(404).send({ message: "Review not found" });
  if (review.reviewerEmail !== req.user.email)
    return res.status(403).send({ message: "Forbidden access" });

  const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// add favorite
app.post("/favorites", verifyToken, async (req, res) => {
  const favorite = req.body;
  if (req.user.email !== favorite.userEmail)
    return res.status(403).send({ message: "Forbidden access" });

  const meal = await mealsCollection.findOne({
    _id: new ObjectId(favorite.mealId),
  });
  if (!meal) return res.status(404).send({ message: "Meal not found" });

  const existingFavorite = await favoritesCollection.findOne({
    userEmail: favorite.userEmail,
    mealId: favorite.mealId,
  });

  if (existingFavorite)
    return res.status(409).send({ message: "Meal already in favorites" });

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

// get favorites
app.get("/favorites/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  if (req.user.email !== email)
    return res.status(403).send({ message: "Forbidden access" });

  const result = await favoritesCollection
    .find({ userEmail: email })
    .sort({ addedTime: -1 })
    .toArray();
  res.send(result);
});

// delete favorite
app.delete("/favorites/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const favorite = await favoritesCollection.findOne({ _id: new ObjectId(id) });

  if (!favorite) return res.status(404).send({ message: "Favorite not found" });
  if (favorite.userEmail !== req.user.email)
    return res.status(403).send({ message: "Forbidden access" });

  const result = await favoritesCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// create order
app.post("/orders", verifyToken, verifyActiveUser, async (req, res) => {
  const order = req.body;
  if (req.user.email !== order.userEmail)
    return res.status(403).send({ message: "Forbidden access" });

  const meal = await mealsCollection.findOne({
    _id: new ObjectId(order.foodId),
  });
  if (!meal) return res.status(404).send({ message: "Meal not found" });

  const quantity = Number(order.quantity);
  if (!quantity || quantity < 1)
    return res.status(400).send({ message: "Quantity must be at least 1" });

  const newOrder = {
    foodId: order.foodId,
    mealName: meal.foodName,
    price: meal.price,
    quantity,
    chefId: meal.chefId,
    chefName: meal.chefName,
    paymentStatus: "pending",
    userEmail: order.userEmail,
    userAddress: order.userAddress,
    orderStatus: "pending",
    orderTime: new Date().toISOString(),
    estimatedDeliveryTime: meal.estimatedDeliveryTime,
  };

  const result = await ordersCollection.insertOne(newOrder);
  res.send(result);
});

// get my orders
app.get("/orders/user/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  if (req.user.email !== email)
    return res.status(403).send({ message: "Forbidden access" });

  const result = await ordersCollection
    .find({ userEmail: email })
    .sort({ orderTime: -1 })
    .toArray();
  res.send(result);
});

// get chef order requests
app.get("/orders/chef/:chefId", verifyToken, verifyChef, async (req, res) => {
  const chefId = req.params.chefId;
  if (!chefId || chefId.trim() === "")
    return res.status(400).send({ message: "Invalid chefId" });
  if (req.dbUser.chefId !== chefId)
    return res.status(403).send({ message: "Forbidden access" });

  const result = await ordersCollection
    .find({ chefId })
    .sort({ orderTime: -1 })
    .toArray();
  res.send(result);
});

// update order status by chef
app.patch("/orders/:id/status", verifyToken, verifyChef, async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;

  if (!ObjectId.isValid(id))
    return res.status(400).send({ message: "Invalid order id" });

  const allowedStatuses = ["cancelled", "accepted", "delivered"];
  if (!allowedStatuses.includes(status))
    return res.status(400).send({ message: "Invalid status" });

  const order = await ordersCollection.findOne({ _id: new ObjectId(id) });
  if (!order) return res.status(404).send({ message: "Order not found" });
  if (order.chefId !== req.dbUser.chefId)
    return res.status(403).send({ message: "Forbidden access" });

  if (order.orderStatus === "cancelled" || order.orderStatus === "delivered") {
    return res.status(400).send({ message: "Order already closed" });
  }

  if (status === "delivered" && order.orderStatus !== "accepted") {
    return res
      .status(400)
      .send({ message: "Only accepted orders can be delivered" });
  }

  if (
    (status === "accepted" || status === "cancelled") &&
    order.orderStatus !== "pending"
  ) {
    return res
      .status(400)
      .send({ message: "Only pending orders can be accepted or cancelled" });
  }

  const result = await ordersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { orderStatus: status } },
  );

  res.send(result);
});

// get single order
app.get("/orders/single/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const result = await ordersCollection.findOne({ _id: new ObjectId(id) });

  if (!result) return res.status(404).send({ message: "Order not found" });
  res.send(result);
});

// save payment
app.post("/payments", verifyToken, async (req, res) => {
  const payment = req.body;
  if (req.user.email !== payment.userEmail)
    return res.status(403).send({ message: "Forbidden access" });

  const order = await ordersCollection.findOne({
    _id: new ObjectId(payment.orderId),
  });
  if (!order) return res.status(404).send({ message: "Order not found" });
  if (order.userEmail !== req.user.email)
    return res.status(403).send({ message: "Forbidden access" });
  if (order.paymentStatus === "paid")
    return res.status(400).send({ message: "Order already paid" });

  const newPayment = {
    orderId: payment.orderId,
    userEmail: payment.userEmail,
    mealName: order.mealName,
    amount: Number(payment.amount),
    transactionId: payment.transactionId,
    paymentMethod: payment.paymentMethod || "stripe",
    orderStatus: order.orderStatus,
    paymentTime: new Date().toISOString(),
  };

  const paymentResult = await paymentsCollection.insertOne(newPayment);

  const orderResult = await ordersCollection.updateOne(
    { _id: new ObjectId(payment.orderId) },
    { $set: { paymentStatus: "paid" } },
  );

  res.send({ paymentResult, orderResult });
});

// create payment intent
app.post("/create-payment-intent", verifyToken, async (req, res) => {
  const { price } = req.body;
  const amount = parseInt(price * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    payment_method_types: ["card"],
  });

  res.send({ clientSecret: paymentIntent.client_secret });
});

// platform statistics
app.get("/admin/statistics", verifyToken, verifyAdmin, async (req, res) => {
  const totalUsers = await usersCollection.countDocuments();
  const ordersPending = await ordersCollection.countDocuments({
    orderStatus: "pending",
  });
  const ordersDelivered = await ordersCollection.countDocuments({
    orderStatus: "delivered",
  });

  const payments = await paymentsCollection.find().toArray();
  const totalPaymentAmount = payments.reduce(
    (total, payment) => total + Number(payment.amount || 0),
    0,
  );

  res.send({ totalPaymentAmount, totalUsers, ordersPending, ordersDelivered });
});

// home daily meals
app.get("/daily-meals", async (req, res) => {
  const result = await mealsCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(result);
});

// home customer reviews
app.get("/reviews", async (req, res) => {
  const result = await reviewsCollection.find().sort({ date: -1 }).toArray();
  res.send(result);
});

// home route
app.get("/", (req, res) => {
  res.send("LocalChefBazaar server is running");
});

// 404 route - always last
app.use((req, res) => {
  res.status(404).send({ message: "Route not found" });
});

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`LocalChefBazaar server is running on port ${port}`);
  });
}

module.exports = app;
