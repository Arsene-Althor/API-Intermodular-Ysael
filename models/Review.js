const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    review_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^REV-[0-9]{5}$/, "Formato REV- seguido de 5 dígitos"],
    },
    room_id: {
      type: String,
      required: true,
      trim: true,
    },
    user_id: {
      type: String,
      required: true,
      trim: true,
    },
    user_name: {
      type: String,
      required: true,
      trim: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
  },
  { timestamps: true, collection: "reviews" }
);

module.exports = mongoose.model("Review", reviewSchema);
