import { Router } from 'express';
import { AppError } from '../utils/AppError.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema } from '../validators/profile.js';
import * as profilesRepository from '../repositories/profilesRepository.js';
import { toProfileDto } from '../services/profileService.js';

export function createProfileRouter({ limiters, authenticate }) {
  const router = Router();
  // limiters.auth only counts failed requests, which throttles token guessing.
  router.use(limiters.auth, authenticate);

  router.get('/', (req, res) => {
    res.json({ profile: toProfileDto(req.auth.profile) });
  });

  router.patch('/', validate(updateProfileSchema), async (req, res) => {
    const { id } = req.auth.profile; // identity comes from the verified token, never the body
    const { data, error } = await profilesRepository.updateFullName(req.auth.db, id, req.valid.body.fullName);
    if (error) throw new Error(`profile update failed: ${error.message}`);
    if (!data) throw AppError.notFound('Profile not found.');
    res.json({ profile: toProfileDto(data) });
  });

  return router;
}
