const prisma = require('../config/prisma');

// Constantes
const MONTO_TOTAL = 320;

// ✅ Registrar participante con posible pago inicial
exports.register = async (req, res) => {
  try {
    const { 
      nombres, 
      apellidos, 
      carrera, 
      ci, 
      celular, 
      tipo_pago, 
      monto_inicial,
      metodo_pago,
      observacion 
    } = req.body;

    // Validar que la cédula no exista
    const existingParticipante = await prisma.participante.findUnique({ 
      where: { ci } 
    });
    
    if (existingParticipante) {
      return res.status(400).json({ error: 'La cédula ya está registrada' });
    }

    // Validar monto inicial
    const montoInicial = parseFloat(monto_inicial) || 0;
    if (montoInicial < 0 || montoInicial > MONTO_TOTAL) {
      return res.status(400).json({ 
        error: `El monto inicial debe estar entre 0 y ${MONTO_TOTAL}` 
      });
    }

    // Calcular estado basado en el pago inicial
    const estado = montoInicial >= MONTO_TOTAL ? 'completado' : 'pendiente';

    // Usar transacción para crear participante y pago de forma atómica
    const result = await prisma.$transaction(async (prisma) => {
      // Crear participante
      const participante = await prisma.participante.create({
        data: {
          nombres,
          apellidos,
          carrera,
          ci,
          celular,
          tipo_pago: tipo_pago || 'cuotas',
          monto_total: MONTO_TOTAL,
          monto_pagado: montoInicial,
          estado: estado,
          usuarioId: req.user?.id
        },
      });

      // Si hay monto inicial, crear el primer pago
      if (montoInicial > 0) {
        await prisma.pago.create({
          data: {
            participanteId: participante.id,
            monto: montoInicial,
            metodo_pago: metodo_pago || 'efectivo',
            observacion: observacion || 'Pago inicial al registro'
          }
        });
      }

      return participante;
    });

    res.status(201).json({ 
      message: montoInicial > 0 
        ? 'Participante registrado con pago inicial' 
        : 'Participante registrado sin pago inicial',
      participante: result 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar participante' });
  }
};

// ✅ Obtener todos los participantes
exports.getAll = async (req, res) => {
  try {
    const { 
      search, 
      estado, 
      carrera,
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let where = {};
    
    // Filtro por búsqueda
    if (search) {
      where.OR = [
        { nombres: { contains: search, mode: 'insensitive' } },
        { apellidos: { contains: search, mode: 'insensitive' } },
        { ci: { contains: search } },
        { carrera: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Filtro por estado
    if (estado) {
      where.estado = estado;
    }

    // Filtro por carrera
    if (carrera) {
      where.carrera = { contains: carrera, mode: 'insensitive' };
    }

    // Obtener el total de registros
    const total = await prisma.participante.count({ where });

    // Obtener participantes con paginación
    const participantes = await prisma.participante.findMany({
      where,
      include: {
        usuario: {
          select: {
            nombre: true,
            usuario: true
          }
        },
        pagos: {
          orderBy: {
            fecha: 'desc'
          }
        }
      },
      orderBy: {
        [sortBy]: sortOrder
      },
      skip,
      take: limitNum
    });

    // Agregar información calculada
    const participantesConInfo = participantes.map(participante => ({
      ...participante,
      monto_restante: MONTO_TOTAL - participante.monto_pagado,
      porcentaje_pagado: ((participante.monto_pagado / MONTO_TOTAL) * 100).toFixed(1)
    }));

    res.json({
      participantes: participantesConInfo,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener participantes' });
  }
};
// ✅ Obtener participante por ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const participante = await prisma.participante.findUnique({
      where: { id: parseInt(id) },
      include: {
        usuario: {
          select: {
            nombre: true,
            usuario: true
          }
        },
        pagos: {
          orderBy: {
            fecha: 'desc'
          }
        }
      }
    });

    if (!participante) {
      return res.status(404).json({ error: 'Participante no encontrado' });
    }

    // Agregar información calculada
    const participanteConInfo = {
      ...participante,
      monto_restante: MONTO_TOTAL - participante.monto_pagado,
      porcentaje_pagado: ((participante.monto_pagado / MONTO_TOTAL) * 100).toFixed(1)
    };

    res.json(participanteConInfo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener participante' });
  }
};

// ✅ Actualizar participante
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nombres, 
      apellidos, 
      carrera, 
      ci, 
      celular, 
      tipo_pago,
      estado 
    } = req.body;

    // Verificar si el participante existe
    const participanteExistente = await prisma.participante.findUnique({
      where: { id: parseInt(id) }
    });

    if (!participanteExistente) {
      return res.status(404).json({ error: 'Participante no encontrado' });
    }

    // Verificar si la cédula ya existe en otro participante
    if (ci && ci !== participanteExistente.ci) {
      const ciExistente = await prisma.participante.findUnique({
        where: { ci }
      });
      
      if (ciExistente) {
        return res.status(400).json({ error: 'La cédula ya está registrada en otro participante' });
      }
    }

    const participante = await prisma.participante.update({
      where: { id: parseInt(id) },
      data: {
        nombres,
        apellidos,
        carrera,
        ci,
        celular,
        tipo_pago,
        estado
      }
    });

    res.json({ 
      message: 'Participante actualizado con éxito', 
      participante 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar participante' });
  }
};

// ✅ Eliminar participante
exports.deleteParticipante = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el participante existe
    const participante = await prisma.participante.findUnique({
      where: { id: parseInt(id) }
    });

    if (!participante) {
      return res.status(404).json({ error: 'Participante no encontrado' });
    }

    // Usar transacción para eliminar pagos primero y luego el participante
    await prisma.$transaction(async (prisma) => {
      // Eliminar pagos del participante
      await prisma.pago.deleteMany({
        where: { participanteId: parseInt(id) }
      });

      // Eliminar participante
      await prisma.participante.delete({
        where: { id: parseInt(id) }
      });
    });

    res.json({ message: 'Participante eliminado con éxito' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar participante' });
  }
};

// ✅ Registrar pago
exports.registrarPago = async (req, res) => {
  try {
    const { id } = req.params;
    const { monto, metodo_pago, observacion } = req.body;

    const participante = await prisma.participante.findUnique({
      where: { id: parseInt(id) }
    });

    if (!participante) {
      return res.status(404).json({ error: 'Participante no encontrado' });
    }

    // Validar que no exceda el monto total
    const nuevoMontoPagado = participante.monto_pagado + parseFloat(monto);
    if (nuevoMontoPagado > MONTO_TOTAL) {
      return res.status(400).json({ 
        error: `El pago excede el monto total. Máximo permitido: ${MONTO_TOTAL - participante.monto_pagado}` 
      });
    }

    // Usar transacción
    const result = await prisma.$transaction(async (prisma) => {
      // Registrar el pago
      const pago = await prisma.pago.create({
        data: {
          participanteId: parseInt(id),
          monto: parseFloat(monto),
          metodo_pago: metodo_pago || 'efectivo',
          observacion
        }
      });

      // Actualizar monto pagado y estado
      const nuevoEstado = nuevoMontoPagado >= MONTO_TOTAL ? 'completado' : 'pendiente';

      await prisma.participante.update({
        where: { id: parseInt(id) },
        data: {
          monto_pagado: nuevoMontoPagado,
          estado: nuevoEstado
        }
      });

      return pago;
    });

    res.status(201).json({ 
      message: 'Pago registrado con éxito', 
      pago: result,
      monto_restante: MONTO_TOTAL - nuevoMontoPagado
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar pago' });
  }
};

// ✅ Obtener pagos de un participante
exports.getPagosByParticipante = async (req, res) => {
  try {
    const { id } = req.params;

    const pagos = await prisma.pago.findMany({
      where: { participanteId: parseInt(id) },
      orderBy: {
        fecha: 'desc'
      }
    });

    res.json(pagos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
};

// ✅ Actualizar pago
exports.updatePago = async (req, res) => {
  try {
    const { id, pagoId } = req.params;
    const { monto, metodo_pago, observacion } = req.body;

    // Verificar que el pago existe y pertenece al participante
    const pagoExistente = await prisma.pago.findFirst({
      where: {
        id: parseInt(pagoId),
        participanteId: parseInt(id)
      }
    });

    if (!pagoExistente) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const pago = await prisma.pago.update({
      where: { id: parseInt(pagoId) },
      data: {
        monto: monto ? parseFloat(monto) : undefined,
        metodo_pago,
        observacion
      }
    });

    res.json({ 
      message: 'Pago actualizado con éxito', 
      pago 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar pago' });
  }
};

// ✅ Eliminar pago
exports.deletePago = async (req, res) => {
  try {
    const { id, pagoId } = req.params;

    // Verificar que el pago existe y pertenece al participante
    const pagoExistente = await prisma.pago.findFirst({
      where: {
        id: parseInt(pagoId),
        participanteId: parseInt(id)
      }
    });

    if (!pagoExistente) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    await prisma.pago.delete({
      where: { id: parseInt(pagoId) }
    });

    // Recalcular monto pagado del participante
    const pagosRestantes = await prisma.pago.aggregate({
      where: { participanteId: parseInt(id) },
      _sum: { monto: true }
    });

    const nuevoMontoPagado = pagosRestantes._sum.monto || 0;
    const nuevoEstado = nuevoMontoPagado >= MONTO_TOTAL ? 'completado' : 'pendiente';

    await prisma.participante.update({
      where: { id: parseInt(id) },
      data: {
        monto_pagado: nuevoMontoPagado,
        estado: nuevoEstado
      }
    });

    res.json({ message: 'Pago eliminado con éxito' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar pago' });
  }
};

// ✅ Obtener resumen de pagos
exports.getResumenPagos = async (req, res) => {
  try {
    const resumen = await prisma.participante.aggregate({
      _sum: {
        monto_pagado: true
      },
      _count: {
        id: true
      }
    });

    const totalRecaudado = resumen._sum.monto_pagado || 0;
    const totalEsperado = resumen._count.id * MONTO_TOTAL;

    // Obtener conteo por estado
    const conteoPorEstado = await prisma.participante.groupBy({
      by: ['estado'],
      _count: {
        id: true
      }
    });

    res.json({
      total_participantes: resumen._count.id,
      total_recaudado: totalRecaudado,
      total_esperado: totalEsperado,
      porcentaje_recaudado: totalEsperado > 0 ? ((totalRecaudado / totalEsperado) * 100).toFixed(1) : 0,
      monto_promedio_por_participante: resumen._count.id > 0 ? (totalRecaudado / resumen._count.id).toFixed(2) : 0,
      conteo_por_estado: conteoPorEstado
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
};