const mongoose = require('mongoose');

const defaultAtlasUri = 'mongodb+srv://phuchgce181933_db_user:rzXiuGvPnrJCJgLU@cluster0.rcyfijm.mongodb.net/saplich?retryWrites=true&w=majority';

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || defaultAtlasUri;
    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
