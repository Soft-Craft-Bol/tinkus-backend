const express = require('express');
const { getUsers, getUserById, updateUser, deleteUser, getUsersByRole, getUserNameById, getUserWithEquipos, getTecnicos, contarUsuarios } = require('../controller/user.controller');
const router = express.Router();
router.get('/', getUsers);
router.get('/tecnicos', getTecnicos);
router.get('/count', contarUsuarios); 
router.get('/:id', getUserById);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.get('/role/:roleId', getUsersByRole);
router.get('/name/:id', getUserNameById); 
router.get('/equipos/:id', getUserWithEquipos); 

module.exports = router;
