import { Router } from 'express';
import * as devController from '../controllers/devController.js';

const router = Router();

router.get('/last-mail', devController.getLastMailForAddress);

export default router;
