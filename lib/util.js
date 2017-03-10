'use strict';

const path = require('path');

let r = {
  startsWith: function (input, str) {
    return input.slice(0, str.length) === str &&
      (input.length === str.length || input[str.length] === '/');
  },
  setHttp: function (link) {
    if (link.search(/^http[s]?\:\/\//) === -1) {
      link = 'http://' + link;
    }
    return link;
  },
  getHost: function (req) {
    if (req.headers.host) {
      return req.headers.host.split(':')[0];
    }
  },
  notFound: function (res) {
    res.statusCode = 404;
    res.write('Not Found');
    res.end();
  },

  /**
   * redirect the requested url to secure https
   */
  redirectToHttps: function (req, res, target, ssl, log) {
    let redirectCode = null;
    const hostname = req.headers.host.split(':')[0] + ':' + (ssl.redirectPort || ssl.port);
    const url = 'https://' + path.join(hostname, req.url);
    log && log.info('Redirecting %s to %s', path.join(req.headers.host, req.url), url);

    if (process.env.NODE_ENV !== 'production') {
      redirectCode = 301;
    } else {
      redirectCode = 302;
    }

    // respond
    res.writeHead(redirectCode, {
      Location: url
    });
    res.end();
  }
};

module.exports = r;
