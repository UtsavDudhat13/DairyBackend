import jwt from 'jsonwebtoken';

const generateToken = (id) => {
  // Token without expiration time
  return jwt.sign({ id }, process.env.JWT_SECRET);
};

export default generateToken;