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

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
// Verify JWT token middleware
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
