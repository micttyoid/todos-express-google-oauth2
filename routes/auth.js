var express = require('express');
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth20');
var db = require('../db');


// Configure the Facebook strategy for use by Passport.
//
// OAuth 2.0-based strategies require a `verify` function which receives the
// credential (`accessToken`) for accessing the Facebook API on the user's
// behalf, along with the user's profile.  The function must invoke `cb`
// with a user object, which will be set at `req.user` in route handlers after
// authentication.
passport.use(new GoogleStrategy({
    clientID: process.env['GOOGLE_CLIENT_ID'],
    clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
    callbackURL: '/oauth2/redirect/accounts.google.com',
    scope: [ 'profile' ],
    state: true
  },
  function(accessToken, refreshToken, profile, cb) {
    // In this example, the user's Facebook profile is supplied as the user
    // record.  In a production-quality application, the Facebook profile should
    // be associated with a user record in the application's database, which
    // allows for account linking and authentication with other identity
    // providers.
    return cb(null, profile);
  }));
  
// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  In a
// production-quality application, this would typically be as simple as
// supplying the user ID when serializing, and querying the user record by ID
// from the database when deserializing.  However, due to the fact that this
// example does not have a database, the complete Facebook profile is serialized
// and deserialized.
passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});


var router = express.Router();

router.get('/login', function(req, res, next) {
  res.render('login');
});

router.get('/login/federated/accounts.google.com', passport.authenticate('google'));

router.get('/oauth2/redirect/accounts.google.com',
  passport.authenticate('google', { assignProperty: 'federatedUser', failureRedirect: '/login' }),
  function(req, res, next) {
    db.get('SELECT * FROM federated_credentials WHERE provider = ? AND subject = ?', [
      'https://accounts.google.com',
      req.federatedUser.id
    ], function(err, row) {
      if (err) { return next(err); }
      if (!row) {
        db.run('INSERT INTO users (name) VALUES (?)', [
          req.federatedUser.displayName
        ], function(err) {
          if (err) { return next(err); }
          
          var id = this.lastID;
          db.run('INSERT INTO federated_credentials (provider, subject, user_id) VALUES (?, ?, ?)', [
            'https://accounts.google.com',
            req.federatedUser.id,
            id
          ], function(err) {
            if (err) { return next(err); }
            var user = {
              id: id.toString(),
              displayName: req.federatedUser.displayName
            };
            req.login(user, function(err) {
              if (err) { return next(err); }
              res.redirect('/');
            });
          });
        });
      } else {
        db.get('SELECT rowid AS id, username, name FROM users WHERE rowid = ?', [ row.user_id ], function(err, row) {
          if (err) { return next(err); }
    
          // TODO: Handle undefined row.
          var user = {
            id: row.id.toString(),
            username: row.username,
            displayName: row.name
          };
          req.login(user, function(err) {
            if (err) { return next(err); }
            res.redirect('/');
          });
        });
      }
    });
    
  });

router.get('/logout', function(req, res, next) {
  req.logout();
  res.redirect('/');
});

module.exports = router;
