const express = require('express');
const router = express.Router();
const {
  register,
  getAll, 
  getById,
  update,
  registrarPago,
  getResumenPagos,
  getPagosByParticipante,
  deleteParticipante,
  updatePago,
  deletePago
} = require('../controller/participante.controller');
const auth = require('../middlewares/auth');

// Aplicar autenticación a todas las rutas
router.use(auth);

// Rutas de participantes
router.post('/register', register);
router.get('/', getAll);
router.get('/resumen', getResumenPagos);
router.get('/:id', getById);
router.put('/:id', update);
router.delete('/:id', deleteParticipante);

// Rutas de pagos
router.post('/:id/pagos', registrarPago);
router.get('/:id/pagos', getPagosByParticipante);
router.put('/:id/pagos/:pagoId', updatePago);
router.delete('/:id/pagos/:pagoId', deletePago);

module.exports = router;