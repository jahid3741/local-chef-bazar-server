# LocalChefBazaar Server

Backend server for the LocalChefBazaar food ordering platform built with Express.js, MongoDB, Firebase Admin SDK, JWT authentication, and Stripe payment integration.

## Live Server

https://local-chef-bazaar-server.vercel.app/

---

# Features

- JWT Authentication
- Firebase Admin SDK Verification
- MongoDB Database Integration
- Stripe Payment Gateway
- Role-based Authorization
  - User
  - Chef
  - Admin

- Order Management
- Meal Management
- Review System
- Favorite Meals
- Request System
- Secure Cookies
- Protected Routes
- Fraud User Detection

---

# Technologies Used

- Node.js
- Express.js
- MongoDB
- Firebase Admin SDK
- JWT
- Stripe
- Cookie Parser
- CORS
- dotenv
- Vercel

---

# Installation

Clone the repository:

```bash
git clone https://github.com/your-username/local-chef-bazaar-server.git
```

Go to project folder:

```bash
cd local-chef-bazaar-server
```

Install dependencies:

```bash
npm install
```

---

# Environment Variables

Create a `.env` file in the root directory and add:

```env
PORT=5000

DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password

JWT_SECRET=your_jwt_secret

STRIPE=your_stripe_secret_key

CLIENT_URL=http://localhost:5173

FB_SERVICE_KEY=your_base64_encoded_firebase_admin_sdk
```

---

# Firebase Admin SDK Setup

1. Go to Firebase Console
2. Project Settings
3. Service Accounts
4. Generate New Private Key
5. Convert JSON file to Base64

Example:

```js
const fs = require("fs");

const key = fs.readFileSync("./serviceAccountKey.json", "utf8");

const base64 = Buffer.from(key).toString("base64");

console.log(base64);
```

Copy the generated Base64 string and use it in:

```env
FB_SERVICE_KEY=
```

---

# Run Locally

Development server:

```bash
npm run dev
```

Production server:

```bash
npm start
```

---

# API Endpoints

## Authentication

| Method | Route     | Description        |
| ------ | --------- | ------------------ |
| POST   | `/jwt`    | Generate JWT token |
| POST   | `/logout` | Logout user        |

---

## Users

| Method | Route                      | Description     |
| ------ | -------------------------- | --------------- |
| PUT    | `/users/:email`            | Save user       |
| GET    | `/users`                   | Get all users   |
| GET    | `/users/:email`            | Get single user |
| PATCH  | `/users/:email/make-admin` | Make admin      |
| PATCH  | `/users/:email/make-chef`  | Make chef       |
| PATCH  | `/users/:email/fraud`      | Mark fraud user |

---

## Meals

| Method | Route        | Description     |
| ------ | ------------ | --------------- |
| POST   | `/meals`     | Add meal        |
| GET    | `/meals`     | Get all meals   |
| GET    | `/meals/:id` | Get single meal |
| PATCH  | `/meals/:id` | Update meal     |
| DELETE | `/meals/:id` | Delete meal     |

---

## Orders

| Method | Route                  | Description         |
| ------ | ---------------------- | ------------------- |
| POST   | `/orders`              | Create order        |
| GET    | `/orders/user/:email`  | User orders         |
| GET    | `/orders/chef/:chefId` | Chef orders         |
| PATCH  | `/orders/:id/status`   | Update order status |

---

## Payments

| Method | Route                    | Description                  |
| ------ | ------------------------ | ---------------------------- |
| POST   | `/create-payment-intent` | Create Stripe payment intent |
| POST   | `/payments`              | Save payment                 |

---

## Reviews

| Method | Route          | Description   |
| ------ | -------------- | ------------- |
| POST   | `/reviews`     | Add review    |
| GET    | `/reviews`     | Get reviews   |
| PATCH  | `/reviews/:id` | Update review |
| DELETE | `/reviews/:id` | Delete review |

---

# Deployment

## Vercel Deployment

Install Vercel CLI:

```bash
npm install -g vercel
```

Deploy:

```bash
vercel --prod
```

---

# Important Notes

- Never expose Firebase private keys publicly
- Use Base64 encoded Firebase Admin SDK in environment variables
- Remove `app.listen()` when deploying to Vercel
- Use `module.exports = app`

---

# Author

Md Jahidul Islam

---
