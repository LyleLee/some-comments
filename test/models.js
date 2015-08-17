var Q      = require('q')
var should = require('should')
var assert = require('assert')
var config = require('../config.js.test')
var models = require('../models/')

//var config = {
//  database: {protocol: 'sqlite'} // In memory sqlite.
//}

describe('Models', function() {
  var model, site, page, comments = []

  before(function(done) {
    this.timeout(15000)

    models(config, {})
      .then(function(modelIn) {
        model = modelIn

        // Setup some test data
        return model.Site.create([{domain: 'testdomain'}])
      })
      .then(function(sites) {
        site = sites[0]

        return model.Page.create([{url:'http://testdomain/myPage'}])
      })
      .then(function(pageIn) {
        page = pageIn

        return model.User.create({displayName: 'Foo Bar'})
      })
      .then(function(user) {

        return model.Comment.createMulti([
          {
            text: 'This is a comment',
            user: user,
            page: page,
          },
          {
            text: 'This is too comment',
            user: user,
            page: page,
          },
          {
            text: 'This is comment, ay?',
            user: user,
            page: page,
          },
        ])
      })
      .then(function(commentsIn) {
        comments = commentsIn
      })
      .done(done)
  })

  describe('Accounts', function() {
    it('should create a user when creating an account', function(done) {
      model.Account.getOrCreate(
        'test', 'fubar', {displayName: 'Foo Bar', email: 'test@example.org'}
      ).then(function(account) {
        account.uid.should.equal('fubar')
        account.user.displayName.should.equal('Foo Bar')
        done()
      })
    })
  })

  describe('Comments', function() {
    it('should list all comments from one page', function(done) {
      Q.ninvoke(page, 'getComments')
        .then(function(pageComments) {
          pageComments.length.should.equal(3)
          done()
        })
    })
  })

  describe('Users', function() {
  //  it('should produce a valid unsubscribe token', function(done) {
  //  it('should return user from valid unsubscribe token', function(done) {
  //  it('should throw error on invalid unsubscribe token', function(done) {

    it('should add subscription', function(done) {
      var user

      model.User.create({displayName: 'Test User', avatar: 'http://my.avatar/jpg'})
        .then(function(userIn) {
          user = userIn
          return user.subscribe(page)
        }).then(function(foo) {
          // Make sure user is subscribed
          return Q.ninvoke(user, 'hasSubscriptions', page)
        }).then(function(has) {
          assert.ok(has)
          done()
        }).done()

    })
  })
})