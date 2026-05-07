import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export const requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing or invalid token format" });
    }

    const token = authHeader.split(" ")[1];
    
    // Validate token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Pass user id to the next middleware/route
    req.userId = decoded.id;
    
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    // Determine if it's an expired token or invalid signature to send appropriate message if needed
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Unauthorized: Token has expired" });
    }
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};
