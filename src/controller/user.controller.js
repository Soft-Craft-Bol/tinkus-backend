const prisma = require("../config/prisma");
const upload = require('../config/multer');
const cloudinary = require('../config/cloudinary');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const EQUIPO_SERVICE_URL = process.env.EQUIPO_SERVICE_URL || "http://localhost:4000/equipos";

exports.getUsers = async (req, res) => {
    const users = await prisma.user.findMany();
    res.json(users);
};

exports.getUserById = async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                roles: {
                    select: {
                        role: {
                            select: {
                                id: true,
                                nombre: true,
                                permisos: {
                                    select: {
                                        permission: {
                                            select: {
                                                id: true,
                                                nombre: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                areas: {
                    select: {
                        area: {
                            select: {
                                id: true,
                                nombre: true
                            }
                        }
                    }
                }
            }
        });

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        // Formatear la respuesta
        const response = {
            ...user,
            roles: user.roles.map(r => r.role),
            areas: user.areas.map(a => a.area),
            foto: user.foto ? `${process.env.BASE_URL}${user.foto}` : null
        };

        res.json(response);
    } catch (error) {
        console.error("Error al obtener usuario:", error);
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
};

exports.updateUser = [
    upload.single('foto'),
    async (req, res) => {
        console.log("Actualizando usuario con ID:", req.body);
        console.log("Datos de la solicitud:", req.params);

        console.log("Roles antes de parsear:", req.body.roles);
        console.log("Áreas antes de parsear:", req.body.areas);

        const userId = parseInt(req.params.id);
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        try {
            // Validación básica de campos requeridos
            const requiredFields = ['nombre', 'apellido', 'usuario', 'email', 'ci'];
            for (const field of requiredFields) {
                if (!req.body[field]) {
                    return res.status(400).json({ error: `Falta el campo requerido: ${field}` });
                }
            }

            const roles = req.body.roles || [];  // Asegurarse de que roles sea un array válido
            const areas = req.body.areas || [];

            const userData = {
                nombre: req.body.nombre,
                apellido: req.body.apellido,
                usuario: req.body.usuario,
                email: req.body.email,
                ci: req.body.ci,
                profesion: req.body.profesion || null
            };

            if (req.body.password) {
                userData.password = await bcrypt.hash(req.body.password, 10);
            }

            if (req.file) {
                const existingUser = await prisma.user.findUnique({ where: { id: userId } });

                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: 'users',
                });

                userData.foto = result.secure_url;

                if (existingUser.foto) {
                    const publicIdMatch = existingUser.foto.match(/\/users\/([^\.\/]+)\./);
                    if (publicIdMatch) {
                        const publicId = `users/${publicIdMatch[1]}`;
                        await cloudinary.uploader.destroy(publicId);
                    }
                }

                fs.unlinkSync(req.file.path);
            }

            const updatedUser = await prisma.$transaction(async (tx) => {
                const user = await tx.user.update({
                    where: { id: userId },
                    data: userData
                });

                // Eliminar roles antiguos
                await tx.userRole.deleteMany({ where: { userId } });
                if (roles.length > 0) {
                    await tx.userRole.createMany({
                        data: roles.map(roleId => ({
                            userId,
                            roleId: parseInt(roleId)
                        }))
                    });
                }

                // Eliminar áreas antiguas
                await tx.userArea.deleteMany({ where: { userId } });
                if (areas.length > 0) {
                    await tx.userArea.createMany({
                        data: areas.map(areaId => ({
                            userId,
                            areaId: parseInt(areaId)
                        }))
                    });
                }

                return user;
            });

            // Obtener usuario completo actualizado
            const fullUser = await prisma.user.findUnique({
                where: { id: userId },
                include: {
                    roles: { include: { role: true } },
                    areas: { include: { area: true } }
                }
            });

            res.json({
                message: "Usuario actualizado correctamente",
                user: {
                    ...fullUser,
                    roles: fullUser.roles.map(r => r.role),
                    areas: fullUser.areas.map(a => a.area),
                    foto: fullUser.foto ? `${process.env.BASE_URL}${fullUser.foto}` : null
                }
            });

        } catch (error) {
            console.error("Error al actualizar usuario:", error);

            // Limpiar imagen si se subió y ocurrió un error
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({
                error: "Error al actualizar usuario",
                details: error.message
            });
        }
    }
];

exports.deleteUser = async (req, res) => {
    console.log("Eliminando usuario con ID:", req.params.id);
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
        return res.status(400).json({ error: "ID inválido" });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { roles: true, equipos: true }
        });

        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        // Eliminar primero las relaciones
        await prisma.userRole.deleteMany({ where: { userId } });
        await prisma.userTeam.deleteMany({ where: { userId } });
        await prisma.userArea.deleteMany({ where: { userId } });

        // Luego eliminar el usuario
        await prisma.user.delete({ where: { id: userId } });

        res.json({ message: "Usuario eliminado correctamente" });
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        res.status(500).json({
            error: "Error al eliminar usuario",
            details: error.message
        });
    }
};


exports.getUsersByRole = async (req, res) => {
    const users = await prisma.user.findMany({
        where: { roles: { some: { roleId: parseInt(req.params.roleId) } } },
        include: { roles: true }
    });
    res.json(users);
};

exports.getUserNameById = async (req, res) => {
    const userId = req.params.id;

    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(userId) },
            select: {
                nombre: true,
                apellido: true
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({
            nombreCompleto: `${user.nombre} ${user.apellido}`
        });
    } catch (error) {
        console.error("Error al obtener nombre de usuario:", error);
        res.status(500).json({
            error: "Error al obtener nombre de usuario",
            details: error.message
        });
    }
};


exports.getUserWithEquipos = async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    try {
        // Obtener datos del usuario
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                roles: { include: { role: true } },
                areas: { include: { area: true } }
            }
        });

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        // Obtener equipos del microservicio de equipos
        const equiposResponse = await axios.get(`${EQUIPO_SERVICE_URL}/user/${userId}`);
        const equipos = equiposResponse.data;

        // Formatear la respuesta
        const response = {
            ...user,
            roles: user.roles.map(r => r.role),
            areas: user.areas.map(a => a.area),
            equipos,
            foto: user.foto ? `${process.env.BASE_URL}${user.foto}` : null
        };

        res.json(response);
    } catch (error) {
        console.error("Error al obtener usuario con equipos:", error);
        res.status(500).json({
            error: "Error al obtener usuario con equipos",
            details: error.message
        });
    }
};


exports.getTecnicos = async (req, res) => {
    try {
        // Buscar el rol de "Tecnico"
        const rolTecnico = await prisma.role.findUnique({
            where: { nombre: "Tecnico" },
            select: { id: true }
        });

        if (!rolTecnico) {
            return res.status(404).json({ error: 'Rol "Tecnico" no encontrado' });
        }

        // Buscar todos los usuarios que tienen el rol de "Tecnico"
        const tecnicos = await prisma.user.findMany({
            where: {
                roles: {
                    some: { roleId: rolTecnico.id }
                }
            },
            include: {
                roles: {
                    include: { role: true }
                },
                areas: {
                    include: { area: true }
                }
            }
        });

        // Formatear la respuesta para simplificar el resultado
        const response = tecnicos.map(user => ({
            id: user.id,
            nombre: user.nombre,
            apellido: user.apellido,
            usuario: user.usuario,
            email: user.email,
            ci: user.ci,
            profesion: user.profesion,
            item: user.item,
            foto: user.foto ? `${process.env.BASE_URL}${user.foto}` : null,
            roles: user.roles.map(r => r.role),
            areas: user.areas.map(a => a.area),
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        }));

        res.json(response);
    } catch (error) {
        console.error("Error al obtener técnicos:", error);
        res.status(500).json({ error: "Error al obtener técnicos" });
    }
};


exports.contarUsuarios = async (req, res) => {
    try {
        const totalUsuarios = await prisma.user.count();
        res.json({ total: totalUsuarios });
    } catch (error) {
        console.error("Error al contar usuarios:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};