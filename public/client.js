/**
 * Some Comments - a comment engine
 * Copyright (C) 2015 Fredrik Liljegren
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the
 * GNU Affero General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See
 * the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with this
 * program. If not, see <http://www.gnu.org/licenses/>.
 *
 * @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt
 * GNU-AGPL-3.0
 */

(function(window) {
  /************************************************************************************************
   * A few simple utility helpers
   ************************************************************************************************/

  /**
   * Make a shortcut to document.getElementById…
   */
  var e = function (id) {return document.getElementById(id)}

  function ForbiddenError(req, call) {
    this.name = "Forbidden"
    this.call = call
    this.req  = req
    this.message = ''
  }
  ForbiddenError.prototype = Error.prototype

  /**
   * Minimal ajax wrapper with promises.
   */
  var ajax = {}
  ajax.call = function(method, url, headers, body) {
    var deferred = window.Q.defer()
    var req = new XMLHttpRequest()
    req.withCredentials = true
    req.open(method, url, true)

    for (var header in headers) {req.setRequestHeader(header, headers[header])}

    req.onload = function() {
      if (req.status >= 200 && req.status < 300) {return deferred.resolve(req.response)}
      if (req.status == 401) {
        deferred.reject(
          new ForbiddenError(req, {method: method, url: url, headers: headers, body: body})
        )
      }
      deferred.reject(req.statusText)
    }
    req.onerror = function() {deferred.reject("Network failure")}
    req.send(body)

    return deferred.promise
  }
  ajax.get = function(url) {
    return ajax.call('GET', url, {}, '')
  }
  ajax.post = function(url, data) {
    headers = {}
    headers['content-type'] = 'application/json'
    body = JSON.stringify(data)
    return ajax.call('POST', url, headers, body)
  }

  function Editor(input, preview) {
    this.update = function () {
      preview.innerHTML = markdown.toHTML(input.value)
    }
    input.editor = this
    this.update()
  }

  function parseUrl(url) {
    return document.createElement('a')
  }


  /************************************************************************************************
   * Some Comments
   ************************************************************************************************/

  var SomeCommentsPrototype = {}

  /**
   * Base class for Some Comments.
   *
   * @param server  string   Base URL, e.g. https://foo.bar/sc/
   * @param siteId  integer  Site ID
   */
  function SomeComments(server) {
    var sc = Object.create(SomeCommentsPrototype)
    sc.server = server
    return sc
  }

  SomeCommentsPrototype.displayByPage = function(siteId, url, elementId) {
    var element = e(elementId)
    var sc      = this
    var site    = Site(sc.server, siteId)
    var urlStr  = encodeURIComponent(url)

    Comment.getAllByPage(site, urlStr)
      .then(function(comments) {
        for (var i = 0; i < comments.length; i++) {
          element.appendChild(Comment.getElement(comments[i]))
        }

        return User.get(sc.server, 'me')
      })
      .then(function (user) {
        // Add input field
        var newCommentDiv = document.createElement('div')
        newCommentDiv.className = 'comment_row'
        var userHtml = user.avatar
          ? '<div class="user">' +
          '  <img alt="' + user.displayName + '" src="' + user.avatar + '" />' +
          '</div>'
          : '<div class="user unknown_user">?</div>'

        newCommentDiv.innerHTML =
          userHtml +
          '<div class="comment_text">' +
          '  <textarea id="comment_' + urlStr + '"' +
          '            placeholder="Type your comment and press enter…" ' +
          '            oninput="this.editor.update()"></textarea>' +
          '  <div class="comment_preview" id="preview_' + urlStr + '"></div>' +
          '</div>'
        element.appendChild(newCommentDiv)

        var input = e('comment_' + urlStr)
        input.addEventListener('keypress', function(kp) {
          if (kp.keyCode === 13 && !kp.ctrlKey && !kp.shiftKey) {
            console.log('POST')
            var commentText = input.value
            input.value = ''
            Comment.add(site, urlStr, commentText)
              .then(function(comment) {
                element.insertBefore(Comment.getElement(comment), newCommentDiv)
              })
          }
        })

        var someCommentInfo = document.createElement('div')
        someCommentInfo.className = 'some_comment_info'
        someCommentInfo.innerHTML =
          '<p>' +
          '  <a href="https://github.com/fiddur/some-comments">Some Comments</a>' +
          '  ©Fredrik Liljegren' +
          '  <a href="http://www.gnu.org/licenses/agpl-3.0.html">GNU AGPL-3.0</a>' +
          '</p>'
        element.appendChild(someCommentInfo)

        new Editor(input, e('preview_' + urlStr))
      })
  }

  SomeCommentsPrototype.getSites = function() {
    return ajax.get(this.server + 'sites/')
      .then(function(sitesJson) {
        return JSON.parse(sitesJson)
      })
  }
  SomeCommentsPrototype.addSite = function(domain) {
    var sc = this

    return ajax.post(
      sc.server + 'sites/', {domain: domain})
      .then(
        function(response) {
          console.log('Added site', response)
        }, function(error) {
          if (error instanceof ForbiddenError) {
            // Lets offer login and retry
            return User.offerLogin(sc.server, error.call)
              .then(function (siteJson) {
                console.log('Added site after auth?', siteJson)
              })
          }
          console.log('Error', error)
        }
      )
  }


  ////////
  // User
  //
  var User = {}

  /**
   * Display a login iframe, promise to fulfil the original request.
   */
  User.offerLogin = function(server, call) {
    console.log('SomeComments: User is not logged in.  Offering login in iframe.')

    var iframe = document.createElement('iframe')
    iframe.src = server + 'login'
    iframe.className = 'login'

    var deferred = Q.defer()

    window.addEventListener("message", function(event) {
      var origUrl   = parseUrl(event.origin)
      var serverUrl = parseUrl(server)

      if (origUrl.hostname !== serverUrl.hostname) {
        console.log('Origin ' + origUrl.hostname + ' != ' + serverUrl.hostname + '.  Ignoring.')
        return
      }

      if (!event.data.authenticated) {return deferred.reject('Not authenticated')}

      // Resend ajax request.
      document.body.removeChild(iframe)
      ajax.call(call.method, call.url, call.headers, call.body).then(deferred.resolve)
    }, false);

    document.body.appendChild(iframe)

    console.log(iframe)

    return deferred.promise
  }

  User.get = function(server, id) {
    return ajax.get(server + 'users/' + id)
      .then(function(userJson) {
        return JSON.parse(userJson)
      }, function(error) {
        // Probably not logged in then…
        return {displayName: '?¿?¿?'}
      })
  }

  ////////
  // Site
  //
  //var SitePrototype = {}

  function Site(server, siteId) {
    var site = {}//object.create(SitePrototype)

    site.id     = siteId
    site.server = server

    return site
  }


  ///////////
  // Comment
  //
  var Comment = {}

  /**
   * Get all the comments from one page
   *
   * @param site    object  A site object
   * @param urlStr  string  The page ID
   */
  Comment.getAllByPage = function(site, urlStr) {
    return ajax.get(
      site.server + 'sites/' + site.id + '/pages/' + urlStr + '/comments/'
    ).then(function(commentsJson) {
      return JSON.parse(commentsJson)
    })
  }

  /**
   * @param site    object  A site object
   * @param urlStr  string  The page ID
   * @param text    string  Comment text
   */
  Comment.add = function(site, urlStr, text) {
    return ajax.post(
      site.server + 'sites/' + site.id + '/pages/' + urlStr + '/comments/', {text: text})
      .then(
        function(commentJson) {
          var comment = JSON.parse(commentJson)
          console.log('Added comment', comment)
          return comment
        }, function(error) {
          console.log('Got error', error)
          if (error instanceof ForbiddenError) {
            // Lets offer login and retry
            return User.offerLogin(site.server, error.call)
              .then(function (commentJson) {
                var comment = JSON.parse(commentJson)
                console.log('After auth: Added comment', comment)
                return comment
              })
          }
          console.log('Error', error)
        }
      )
  }

  Comment.getElement = function(comment) {
    var div = document.createElement('div')

    div.className = 'comment_row'
    div.innerHTML =
      '<div class="user"><img alt="' + comment.user.displayName + '" src="' + comment.user.avatar
      + '" /></div><div class="comment_text">'
      + markdown.toHTML('**' + comment.user.displayName + '**: ' + comment.text)
      + '<div class="created">' + comment.created_at + '</div></div>'

    return div
  }

  // Make some things available on window
  window.SomeComments = SomeComments
})(window)

// @license-end
