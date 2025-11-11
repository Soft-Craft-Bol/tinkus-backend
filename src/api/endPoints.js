const express = require('express');
const router = express.Router();
const authRoutes = require('../routes/auth.routes');
const participanteRoutes = require('../routes/participante.routes');


router.use('/api/auth', authRoutes);
router.use('/api/participantes', participanteRoutes);

module.exports = router;