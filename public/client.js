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

/**
 * This file contains all that is needed on the actual commenting page except two dependencies:
 *  * q.js
 *  * markdown.js
 *
 * Code design is meant to keep dependencies down to a minimum, and disregard deprecated browsers -
 * commenting is hardly a critical service.  When IE12 is rolled out we can skip Q and use native
 * promises…
 */

(function(window) {
  'use strict'

  /************************************************************************************************
   * A few simple utility helpers
   ************************************************************************************************/

  /**
   * Make a shortcut to document.getElementById…
   */
  var e = function (id) {return document.getElementById(id)}

  function ForbiddenError(req, call) {
    this.name = 'Forbidden'
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
  ajax.del = function(url) {
    return ajax.call('DELETE', url, {}, '')
  }
  ajax.post = function(url, data) {
    var headers = {}
    headers['content-type'] = 'application/json'
    var body = JSON.stringify(data)
    return ajax.call('POST', url, headers, body)
  }
  ajax.put = function(url, data) {
    var headers = {}
    headers['content-type'] = 'application/json'
    var body = JSON.stringify(data)
    return ajax.call('PUT', url, headers, body)
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

  function getNewCommentDivInnerHtml(user, urlStr) {
    var userHtml = user.avatar ?
        '<div class="comment_avatar">' +
        '  <img title="' + user.displayName + '" alt="' + user.displayName + '" ' +
        ' src="' + user.avatar + '" />' +
        '</div>'
        : '<div class="comment_avatar unknown_user">?</div>'

    return userHtml +
      '<div class="comment">' +
      '  <textarea id="comment_' + urlStr + '"' +
      '            placeholder="Type your comment and press enter…" ' +
      '            oninput="this.editor.update()"></textarea>' +
      '  <div class="comment_preview" id="preview_' + urlStr + '"></div>' +
      '</div>'
  }

  SomeCommentsPrototype.displayByPage = function(siteId, url, elementId) {
    var element = e(elementId)
    var sc      = this
    var site    = Site(sc.server, siteId)
    var urlStr  = encodeURIComponent(url)

    window.Q.all([
      Comment.getAllByPage(site, urlStr),
      User.get(sc.server, 'me')
    ])
      .spread(function(comments, user) {
        for (var i = 0; i < comments.length; i++) {
          element.appendChild(Comment.getElement(comments[i], user))
        }

        // Add input field
        var newCommentDiv = document.createElement('div')
        newCommentDiv.className = 'comment_row'
        newCommentDiv.innerHTML = getNewCommentDivInnerHtml(user, urlStr)
        element.appendChild(newCommentDiv)

        var input = e('comment_' + urlStr)
        input.addEventListener('keypress', function(kp) {
          if (kp.keyCode === 13 && !kp.ctrlKey && !kp.shiftKey) {
            var commentText = input.value
            input.value = ''
            Comment.add(site, urlStr, commentText)
              .then(function(comment) {
                comment.site = site
                element.insertBefore(Comment.getElement(comment, user), newCommentDiv)

                // Re-get the new comment div html, since user might have logged in.
                /// @todo Bind this to users/me instead.
                newCommentDiv.innerHTML = getNewCommentDivInnerHtml(comment.user)
                new Editor(input, e('preview_' + urlStr))
              }).done()
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
      }).done()
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
    var iframe = document.createElement('iframe')
    iframe.src = server + 'login'
    iframe.className = 'login'

    var deferred = Q.defer()

    window.addEventListener('message', function(event) {
      var origUrl   = parseUrl(event.origin)
      var serverUrl = parseUrl(server)

      if (origUrl.hostname !== serverUrl.hostname) {return }

      if (!event.data.authenticated) {return deferred.reject('Not authenticated')}

      // Resend ajax request.
      document.body.removeChild(iframe)
      ajax.call(call.method, call.url, call.headers, call.body).then(deferred.resolve).done()
    }, false);

    document.body.appendChild(iframe)

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
      var comments = JSON.parse(commentsJson)
      return comments.map(function(comment) {comment.site = site; return comment})
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
          return comment
        }, function(error) {
          if (error instanceof ForbiddenError) {
            // Lets offer login and retry
            return User.offerLogin(site.server, error.call)
              .then(function (commentJson) {
                var comment = JSON.parse(commentJson)
                return comment
              })
          }
          console.log('Error', error)
        }
      )
  }

  Comment.delHook = function() {
    var element = this

    var commentUrl = element.getAttribute('comment_url')
    ajax.del(commentUrl)
      .then(function() {
        var commentRow = element.parentNode.parentNode.parentNode
        commentRow.parentNode.removeChild(commentRow)
      }).done()
  }

  Comment.getElement = function(comment, user) {
    var displayName = comment.user.displayName || ''
    var avatarSrc   = comment.user.avatar      || ''
    var createdAt   = comment.createdAt        || ''

    // Building the comment DOM
    var div = document.createElement('div')
    div.className = 'comment_row'
    {
      var avatarDiv = document.createElement('div')
      avatarDiv.className = 'comment_avatar'
      {
        var avatarImg = document.createElement('img')
        avatarImg.src = avatarSrc
        avatarImg.alt = displayName
        avatarDiv.appendChild(avatarImg)
      }
      div.appendChild(avatarDiv)

      var commentDiv = document.createElement('div')
      commentDiv.className = 'comment'
      {
        if (user && comment.user.id === user.id) {
          var editOptions = document.createElement('div')
          editOptions.className = 'edit_options'
          {
            var editButton = document.createElement('button')
            editButton.className = 'comment_edit'
            editButton.title = 'Edit'
            editButton.appendChild(document.createTextNode('✎'))
            editOptions.appendChild(editButton)

            var deleteButton = document.createElement('button')
            deleteButton.className = 'comment_delete'
            deleteButton.title = 'Delete'
            deleteButton.setAttribute(
              'comment_url',
              comment.site.server + 'sites/' + comment.site.id + '/pages/' +
                comment.pageId + '/comments/' + comment.id
            )

            deleteButton.addEventListener('click', Comment.delHook)
            editOptions.appendChild(deleteButton)
          }
          commentDiv.appendChild(editOptions)
        }

        var commenterName = document.createElement('span')
        commenterName.className = 'commenter_name'
        commenterName.appendChild(document.createTextNode(displayName))
        commentDiv.appendChild(commenterName)

        var commentText = document.createElement('div')
        commentText.className = 'comment_text'
        commentText.innerHTML = markdown.toHTML(comment.text)
        commentDiv.appendChild(commentText)

        var createdAtSpan = document.createElement('span')
        createdAtSpan.className = 'comment_created'
        createdAtSpan.appendChild(document.createTextNode(createdAt))
        commentDiv.appendChild(createdAtSpan)
      }
      div.appendChild(commentDiv)
    }

    return div
  }

  // Make some things available on window
  window.SomeComments = SomeComments
})(window)

// @license-end
