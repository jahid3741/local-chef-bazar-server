const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: [process.env.CLIENT_URL],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.enrgmwd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

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
    const database = client.db("localChefBazaarDB");

    const usersCollection = database.collection("users");
    const mealsCollection = database.collection("meals");
    const reviewsCollection = database.collection("reviews");
    const favoritesCollection = database.collection("favorites");
    const ordersCollection = database.collection("orders");
    const requestsCollection = database.collection("requests");
    const paymentsCollection = database.collection("payments");

    app.locals.usersCollection = usersCollection;

    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.JWT_SECRET, {
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

    app.post("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

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

    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const user = await usersCollection.findOne({ email });
      res.send(user);
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

    app.get("/", (req, res) => {
      res.send("LocalChefBazaar server is running");
    });

    app.get("/health", async (req, res) => {
      res.send({
        status: "ok",
        message: "Server and database are ready",
      });
    });

    console.log("LocalChefBazaar database connected");
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`LocalChefBazaar server is running on port ${port}`);
});
