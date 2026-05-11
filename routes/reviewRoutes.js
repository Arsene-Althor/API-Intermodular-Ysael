const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { requireLogin } = require("../middleware/authMiddleware");

router.get("/mine", requireLogin, reviewController.getMyReviews);
router.get("/room/:roomId", reviewController.getReviewsByRoom);
router.post("/create", requireLogin, reviewController.createReview);
router.delete("/delete", requireLogin, reviewController.deleteReview);

module.exports = router;
