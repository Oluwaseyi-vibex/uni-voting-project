import axios from "axios";

const verifyCaptcha = async (req, res, next) => {
  const token = req.body.captchaValue;
  if (!token) {
    return res.status(400).json({ message: "CAPTCHA token missing" });
  }

  try {
    const { data } = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify`,
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: token,
        },
      }
    );

    if (!data.success) {
      return res.status(400).json({ message: "Invalid CAPTCHA", data });
    }

    next(); // CAPTCHA verified
  } catch (error) {
    console.error("CAPTCHA verification failed:", error.message);
    return res.status(500).json({ message: "CAPTCHA verification error" });
  }
};

export default verifyCaptcha;
