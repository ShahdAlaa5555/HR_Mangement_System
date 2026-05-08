const router = require('express').Router();
const ctrl = require('./notification.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', ctrl.getMyNotifications);
router.patch('/read-all', ctrl.markAllAsRead);

module.exports = router;