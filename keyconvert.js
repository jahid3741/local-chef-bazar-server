const fs = require('fs');
const key = fs.readFileSync('./local-chef-bazar-21992-firebase-adminsdk-fbsvc-6110e34572.json', 'utf8');
const base64 = Buffer.from(key).toString('base64');
console.log(base64);