'use strict';

const http = require('http');
const https = require('https');
const httpProxy = require('http-proxy');
const cluster = require('cluster');
const path = require('path');

const { log } = require('./tools');
const util = require('./util');

function createProxy(opts) {
  // Create a proxy server with custom application logic
  let proxy = httpProxy.createProxyServer({
    xfwd: (opts.xfwd != false) ? true : false,
    prependPath: false,
    secure: (opts.secure != false) ? true : false
  });

  proxy.on('proxyReq', function (p, req) {
    if (req.host != null) {
      p.setHeader('host', req.host);
    }
  });

  // To Support NTLM auth
  if (opts.ntlm) {
    proxy.on('proxyRes', function (proxyRes) {
      let key = 'www-authenticate';
      proxyRes.headers[key] = proxyRes.headers[key] && proxyRes.headers[key].split(',');
    });
  }

  return proxy;
}

class ReverseProxy {
  constructor(opts) {
    this.opts = opts = opts || {};
    this.routing = {};
    this.log = opts.log === false ? false : true;

    // cluster support
    if (opts.cluster && cluster.isMaster) {
      for (let i = 0; i < opts.cluster; i++) {
        cluster.fork();
      }

      cluster.on('exit', function (worker, code, signal) {
        // Fork if a worker dies.
        this.log && log.error({
          code: code,
          signal: signal
        }, 'worker died un-expectedly... restarting it.');
        cluster.fork();
      });
    } else {
      this.setUp.call(this);
    }

  }

  setUp() {
    let opts = this.opts, proxy = createProxy(this.opts);

    // define response handler
    const responseHandler = (req, res) => {
      const src = req.headers.host;
      const target = this.getTarget(src, req);

      if (target) {

        // TODO
        // Incase request is http, and TLS option was provided,
        // Consider automatically redireting the request to https
        proxy.web(req, res, {
          target: target
        });

        // Listen to the `upgrade` event and proxy the
        // WebSocket requests as well.
        proxy.on('upgrade', function wsUpgrade(req, socket, head) {
          proxy.ws(req, socket, head);
        });

      } else {
        util.notFound(res);
      }
    };

    // Standard HTTP Proxy Server.
    const server = this.serverHTTP = http.createServer(responseHandler);

    server.on('listening', () => {
      log.info(server.address(), 'http server is running');
    });

    server.on('error', function (err) {
      if (err.code === 'EADDRINUSE') {
        log.warn('that address is already in use');
        process.exit(1);
      }

      throw err;
    });

    // secure server
    let secureServer = null;
    if (this.opts.ssl) {
      secureServer = this.serverHTTPS = https.createServer(this.opts.ssl, responseHandler);

      secureServer.on('listening', x => {
        log.info(secureServer.address(), 'https server is running');
      });
    }
  }


  register(source, destination) {
    let thisReg = {};
    destination = util.setHttp(destination);
    if (!this.routing) {
      this.routing = {};
    }
    if (this.routing[source]) {
      thisReg = this.routing[source];
    }

    // reset roundrobin to 0
    thisReg.rr = 0;

    // set the route
    if (Array.isArray(thisReg.routes)) {
      thisReg.routes[thisReg.length] = destination;
    } else {
      thisReg.routes = [destination];
    }

    this.routing[source] = thisReg;
  }

  getTarget(src) {
    if (!src) {
      return;
    }

    const routesHost = this.routing[src];

    if (!routesHost) {
      return;
    } else {
      if (routesHost.routes.length === 0) {
        return;
      } else {
        let target = routesHost.routes[routesHost.rr];
        this.routing[src].rr = (routesHost.rr + 1) % routesHost.routes.length;
        return target;
      }
    }
  }
}

module.exports = ReverseProxy;
