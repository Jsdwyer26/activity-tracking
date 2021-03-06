// SERVER.js

// APP REQUIREMENTS
var express = require('express');
    bodyParser = require('body-parser'),
    hbs = require('hbs'),
    app = express(),
    mongoose = require('mongoose'),
    User = require('./models/user'),
    Activity = require('./models/activity'),
    cookieParser = require('cookie-parser'),
    session = require('express-session'),
    flash = require('express-flash'),
    passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy;

mongoose.connect(
  process.env.MONGOLAB_URI ||
  process.env.MONGOHQ_URL ||
  'mongodb://localhost/activity-tracking'
);
app.set('view engine', 'hbs');
hbs.registerPartials(__dirname + '/views/partials');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true, parameterLimit: 100000, limit: 1024 * 1024 * 100 }));
app.use(bodyParser.json({extended: true, parameterLimit: 100000, limit: 1024 * 1024 * 100 }));
app.use(cookieParser());
app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// FUNCTIONS
// Redirect to login page if user not signed-in
function isAuthenticated(req, res, next) {
    if (req.user){
        return next();
    }
    res.redirect('/login');
}

// ROUTES
// GET - Register
app.get('/register', function (req, res) {
    if(req.user){
        res.redirect('/index');
    } else {
        res.render('register', {errorMessage: req.flash('registerError')});
    }
});
// POST - Register
app.post('/register', function (req, res){
  User.register(new User({ username: req.body.username, coachMeProfileUrl: req.body.coachMeProfileUrl, email: req.body.email }), req.body.password,
    function (err, newUser) {
          if (err){
            req.flash('registerError', err.message);
            res.redirect('/register');
          } else {
              passport.authenticate('local')(req, res, function() {
                res.redirect('/index');
              });
          }
      }
  );
});
// GET - User Login
app.get('/login', function (req, res){
    res.render('login', { errorMessage: req.flash('error') });
});
// POST - User Login
app.post('/login', passport.authenticate('local', {
  successRedirect : '/index',
  failureRedirect : '/login',
  failureFlash : true
}));
// GET - User Log-out
app.get('/logout', function (req, res) {
  req.logout();
  res.redirect('/login');
});
// GET - External (not logged in) view for users
app.get('/user/:id', function (req, res){
  var userId = req.params.id;
  User.findOne({_id: userId})
      .populate('activities')
          .exec(function(err, singleUser){
              res.render('index', {user: singleUser});
          });
});
// GET - Activity Index (Primary Dashboard View)
app.get('/index', isAuthenticated, function (req, res){
  var userId = req.user.id;
  User.findOne({_id: userId})
      .populate('activities')
          .exec(function(err, singleUser){
              res.render('index', {user: singleUser});
          });
});
// GET - (API) All Activities
app.get('/api/user/:id/activity', isAuthenticated, function (req, res){
  var userId = req.params.id;
  User.findOne({_id: userId})
      .populate('activities')
          .exec(function(err, singleUser){
              res.json({user: singleUser});
          });
});
// GET - List of all records for one activity
app.get('/user/:id/activity/:activityname', isAuthenticated, function (req, res){
  var userId = req.params.id;
  User.findOne({_id: userId}, function(err, foundUser){
    var activityName = req.params.activityname[0].toUpperCase() + req.params.activityname.slice(1);
    res.render('activity', {user: foundUser, activityName: activityName});
  });
});
// GET - (API) List of all records for one activity
app.get('/api/user/:id/activity/:activityname', isAuthenticated, function (req, res){
  var userId = req.params.id;
  var activityName = req.params.activityname[0].toUpperCase() + req.params.activityname.slice(1);
  Activity.find({activityLabel: activityName}, function(err, activityList){
    if(err){console.error(err);}
    else {
      res.json(activityList);
    }
  });
});
// DELETE - (API) Delete list of all records for one activity
app.delete('/api/user/:id/activity/:activityname', isAuthenticated, function (req, res){
  var userId = req.params.id;
  var activityName = req.params.activityname[0].toUpperCase() + req.params.activityname.slice(1);
  Activity.remove({activityLabel: activityName}, function(err, deletedActivityList){
    if(err){console.error(err);}
    else {
      res.json(deletedActivityList);
    }
  });
});
// POST - (API) Retrieve and save all data
app.post('/api/fileupload', isAuthenticated, function (req, res){
  console.log("inside /api/fileupload");
  var obj = req.body;
  var arr = Object.keys(obj).map(function(k) { return obj[k]; });
  var user_id = arr[0].user_id;
  Activity.collection.insert(arr, function(err, result){
    User.findOne({_id: user_id}, function(err, foundUser){
      foundUser.activities = result.ops;
      foundUser.save();
    });
  });

});

// GET - (API) Activity Count by Grouping
app.get('/api/user/:id/activitycountbygroup', function (req,res){
  var userId = req.params.id;
  Activity.aggregate([
        { 
            $match : { user_id : userId }
        },
        {
            $group: {
                _id : { originalYear: "$originalYear", activityLabel: "$activityLabel" },
                count: {$sum: 1}
            }
        }
    ], function (err, result) {
        if (err) {
            next(err);
        } else {
            res.json(result);
        }
    });
});
// GET - (API) List of longest streaks
app.get('/api/user/:id/streaks', function (req, res){
    var userId = req.params.id;
    Activity.aggregate([
       { 
          $match : { user_id : userId }
        },
       {
         $group:{
             _id: "$activityLabel",
             date : { $first: '$originalDate' },
             streakInDays: { $max: "$quantityB" }
           },
       },
       { $sort:{
            streakInDays : 1
           }
       }
     ], function (err, result) {
        if (err) {
            next(err);
        } else {
            res.json(result);
        }
    });
});
// GET - (API) List of activity count per day of week
app.get('/api/user/:id/activityperweek/:activity', function (req, res){
  var userId = req.params.id;
  var activity = req.params.activity;
  Activity.aggregate([
        { 
            $match : { user_id : userId, activityLabel: activity }
        },
        {
            $group: {
                _id : { originalYear: "$originalYear", dayOfWeek: "$originalDayOfWeek", activityLabel: "$activityLabel" },
                count: {$sum: 1}
            }
        }
    ], function (err, result) {
        if (err) {
            next(err);
        } else {
            res.json(result);
        }
    });
});
// GET - (API) List of all activities by day
app.get('/api/user/:id/allactivitiesbyday', function (req, res){
  var userId = req.params.id;
  Activity.aggregate([
        {
          $match: { user_id : userId}
        },
        { $group: {
            _id : "$originalDate",
            year : { $first: "$originalYear" },
            month : { $first: "$originalMonth" },
            day : { $first: "$originalDay" },
            count: {$sum: 1}
          }

        },
        { $sort:{year : 1, month: 1, day: 1}}
        ], function (err, result) {
          if (err) {
              next(err);
          } else {
              res.json(result);
          }
        });
});

// SERVER PORT
app.listen(process.env.PORT || 3000, function(){
    console.log("Server is running");
});