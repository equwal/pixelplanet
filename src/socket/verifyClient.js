/*
 * used to authenticate websocket session
 */

import express from 'express';

import session from '../core/session';
import passport from '../core/passport';
import User from '../data/models/User';
import { expressTTag } from '../core/ttag';
import { getIPFromRequest } from '../utils/ip';

const router = express.Router();

router.use(session);

router.use(passport.initialize());
router.use(passport.session());

router.use(expressTTag);


function authenticateClient(req) {
  return new Promise(
    ((resolve) => {
      router(req, {}, async () => {
        const country = req.headers['cf-ipcountry'] || 'xx';
        const countryCode = country.toLowerCase();
        const user = (req.user) ? req.user
          : new User(null, getIPFromRequest(req));
        user.setCountry(countryCode);
        user.ttag = req.ttag;
        user.lang = req.lang;
        resolve(user);
      });
    }),
  );
}

export default authenticateClient;
