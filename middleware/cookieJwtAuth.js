import jwt from 'jsonwebtoken';

const cookieJwtAuth = (req, res,next) => {
    const token = req.cookies.token;
    console.log(token);
    try {
        const user = jwt.verify(token, process.env.TOKEN_SECRET);
        req.user = user;
        next()
    } catch (err) {
        res.clearCookie("token");
        return res.redirect("/");
    }
};

export default cookieJwtAuth;
