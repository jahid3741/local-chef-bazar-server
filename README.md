# LocalChefBazaar Server

Backend API for LocalChefBazaar, a MERN marketplace for local home-cooked meals.

## Purpose

This server handles authentication tokens, users, role requests, meals, reviews, favorites, orders, payments, and admin dashboard statistics.

## Live URL

Add your deployed server URL here.

## Key Features

- JWT authentication using httpOnly cookies
- MongoDB database connection
- User role management: user, chef, admin
- Role request system for chef/admin approval
- Meal CRUD APIs for chefs
- Public meal listing with sorting and pagination
- Meal reviews and user review management
- Favorite meals system
- Order placement and chef order status management
- Payment history and order payment status update
- Admin platform statistics
- Fraud user restriction support

## NPM Packages Used

- express
- cors
- dotenv
- mongodb
- cookie-parser
- jsonwebtoken
- nodemon

## Environment Variables

Create a `.env` file using `.env.example`.

```env
PORT=5000
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password
JWT_SECRET=your_jwt_secret
CLIENT_URL=your_client_url
NODE_ENV=production
```
