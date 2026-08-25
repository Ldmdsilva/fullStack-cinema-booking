import * as adminService from '../services/adminService.js';

export async function getStats(req, res, next) {
  try {
    const stats = await adminService.getStats();
    return res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
}

export async function listShowtimes(req, res, next) {
  try {
    const result = await adminService.listAdminShowtimes(req.query);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
