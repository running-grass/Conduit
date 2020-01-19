let facebook = require('./authenticators/facebook');
let google = require('./authenticators/google');
let local = require('./authenticators/local');
let Token = require('./models/Token');
const jwt = require('jsonwebtoken');


const configuration = {
    local: {
        identifier: 'email',
        active: true
    },
    generateRefreshToken: false,
    rateLimit: 3,
    tokenInvalidationPeriod: 86400000,
    refreshTokenInvalidationPeriod: 86400000 * 7,
    jwtSecret: ''
};

/**
 * @param router
 * @param config The configuration for the plugin
 * {
 *     local: {
 *         identifier: string - default: email,
 *         active: boolean - default: true
 *     },
 *     @optional facebook:{
 *         clientId: string,
 *         clientSecret: string
 *         oAuthRedirectUrl: string
 *     },
 *     @optional google:{
 *         clientId: string,
 *         clientSecret: string
 *         oAuthRedirectUrl: string
 *     }
 *     generateRefreshToken: boolean - default: false,
 *     rateLimit: number - default: 3 (per minute)
 *     tokenInvalidationPeriod: number | null - default 1 day (milliseconds)
 *     refreshTokenInvalidationPeriod: number | null - default 1 week (milliseconds)
 *
 * }
 *
 *
 */
function authentication(app, config) {

    if (config && !Object.prototype.toString.call(config)) {
        throw new Error("Malformed config provided")
    }

    if (!router) {
        throw new Error("No router provided")
    }

    if (config.local) {
        app.get('/authentication/local', local.authenticate);
        app.get('/authentication/local/new', local.register);

    }

    if (config.facebook) {
        app.get('/authentication/facebook', facebook.authenticate);
    }

    if (config.google) {
        app.get('/authentication/google', google.authenticate);
    }

}

function middleware(req, res, next) {
    const header = req.headers['Authorization'] || req.headers['authorization'];
    if (header === null || header === undefined) {
        return res.status(401).json({error: 'Unauthorized'});
    }
    const args = header.split(' ');

    const prefix = args[0];
    if (prefix !== 'Bearer') {
        return res.status(401).json({error: 'The auth header must begin with Bearer'});
    }

    const token = args[1];
    if (token === null || token === undefined) {
        return res.status(401).json({error: 'No token provided'});
    }

    const decoded = jwt.verify(token, configuration.jwtSecret);
    if (decoded === null || decoded === undefined) return res.status(401).json({error: 'Invalid token'});

    const {id: userId} = decoded;

    Token.findOne({_id: userId})
        .then(async user => {
            if (user === null || user === undefined) {
                throw new HttpError(null, 'User not found', 404);
            }
            req.user = user;
            next();
        })
        .catch(next);
}

module.exports.initialize = authentication;
module.exports.authenticate = middleware;