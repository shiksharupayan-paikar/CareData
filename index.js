require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const User = require("./models/user");
const ejsMate = require("ejs-mate");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const passportLocal = require("passport-local");
const methodOverride = require("method-override");
const multer = require("multer");
const { storage } = require("./clodinary");
const moment = require("moment");
const DoctorDetails = require("./models/doctorDetails");
const AppError = require("./error/AppError");
const {
  registerValidation,
  loginValidation,
} = require("./validation/loginValidation");
const {
  doctorDetailsValidation,
} = require("./validation/doctorDetailsValidation");
const cors = require("cors");
const { isLoggedIn } = require("./middleware/isLoggedIn");

moment().format();

mongoose
  .connect("mongodb://127.0.0.1:27017/caredata", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected!"))
  .catch((e) => console.log(e));

const app = express();
const PORT = process.env.PORT || 8080;
const sessionConfig = {
  name: "session",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
};
const upload = multer({ storage });

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session(sessionConfig));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride("_method"));
app.use(cors());
passport.use(new passportLocal(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

app.get("/caredata", (req, res) => {
  res.render("home/index");
});

app.get("/doctorsProfile", (req, res) => {
  res.render("doctor/doctorProfile");
});

app.get("/caredata/doctors", async (req, res) => {
  const doctors = await User.find({}).populate("doctorDetails");
  res.render("doctor/findDoctors", { doctors });
});

app.get("/register", (req, res) => {
  res.render("login/registerPage");
});

app.post(
  "/register",
  upload.single("image"),
  registerValidation,
  async (req, res, next) => {
    try {
      const { fullName, username, emailId, password, entryType } = req.body;
      const user = new User({ fullName, username, emailId, entryType });
      if (req.file) {
        user.image.path = req.file.path;
        user.image.filename = req.file.filename;
      } else {
        user.image.path = "";
        user.image.filename = "";
      }
      try {
        const registeredUser = await User.register(user, password);
        req.logIn(registeredUser, (err) => {
          if (err) next(err);
          req.flash("success", "Welcome to CareData");
          res.redirect(`/caredata/users/${user._id}`);
        });
      } catch (error) {
        req.flash("error", error.message);
        res.redirect("/register");
      }
    } catch (error) {
      next(error);
    }
  }
);

app.get("/login", (req, res) => {
  res.render("login/loginPage");
});

app.post(
  "/login",
  loginValidation,
  passport.authenticate("local", {
    failureFlash: true,
    failureRedirect: "/login",
  }),
  async (req, res, next) => {
    try {
      await User.findOne({ username: req.body.username });
      req.flash("success", "Welocome Back to CareData :)");
      res.redirect("/caredata");
    } catch (error) {
      next(error);
    }
  }
);

app.get("/caredata/users/:id", isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("doctorDetails");
    res.render("patient/profilePage", { user });
  } catch (error) {
    console.log(error);
  }
});

app.get("/caredata/users/:id/edit", async (req, res) => {
  const user = await User.findById(req.params.id)
    .then((data) => data)
    .catch((e) => e);
  res.render("patient/edit", { user });
});

app.put("/caredata/users/:id", async (req, res, next) => {
  await User.findByIdAndUpdate(req.params.id, req.body);
  res.redirect(`/caredata/users/${req.params.id}`);
});

app.get("/caredata/users/:id/adddetails", async (req, res) => {
  const user = await User.findById(req.params.id);
  res.render("doctor/addDoctorDetails", { user });
});

app.post(
  "/caredata/users/:id/adddetails",
  doctorDetailsValidation,
  async (req, res, next) => {
    try {
      const doctorDetails = new DoctorDetails(req.body);
      const user = await User.findById(req.params.id);
      user.doctorDetails = doctorDetails;
      await doctorDetails.save();
      await user.save();
      req.flash("success", "Your details has been added :)");
      res.redirect(`/caredata/users/${req.params.id}`);
    } catch (error) {
      req.flash("error", "Can't add the details :(");
      next(error);
    }
  }
);

app.post("/logout", async (req, res) => {
  req.logOut(() => {
    try {
      req.flash("success", "You're Logged Out Now!");
      res.redirect("/caredata");
    } catch (error) {
      next(error);
    }
  });
});

app.get("/caredata/users/:id/upload", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    res.render("patient/uploadPage", { moment, user });
  } catch (error) {
    next(error);
  }
});

app.get("/caredata/users/:id/upload/:postId", async (req, res, next) => {
  try {
    const { postId } = req.params;
    res.render("patient/showFile");
  } catch (error) {
    next(error);
  }
});

app.get("/caredata/users/:id/files", async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).populate("files");
    res.render("patient/allUploadedFiles", { user });
  } catch (error) {
    next();
  }
});
app.all("*", (req, res, next) => {
  return next(new AppError(404, "Page Not Found!"));
});
app.use((err, req, res, next) => {
  if (!err.message && !err.status) {
    err.message = "Something Went Wrong!";
    err.status(500);
  }
  res.render("error/error", { err });
  next();
});
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
