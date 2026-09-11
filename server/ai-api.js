import { Router } from 'express';
import { z } from 'zod';
import { handlePlayerMessage, handleRoll } from './ai-master.js';
import { pool } from './db.js';

export const aiApi = Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

async function assertCharacter(characterId, campaignId) {
  const { rows } = await pool.query('SELECT id FROM characters WHERE id=$1::uuid AND campaign_id=$2::uuid AND kind=\'PLAYER\'', [characterId, campaignId]);
  if (!rows[0]) throw Object.assign(new Error('Активный персонаж не найден в этой кампании'), { status: 404 });
}

aiApi.post('/campaigns/:id/ai/messages', asyncRoute(async (req, res) => {
  const campaignId = z.string().uuid().parse(req.params.id);
  const input = z.object({ characterId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(req.body);
  await assertCharacter(input.characterId, campaignId);
  res.status(201).json(await handlePlayerMessage({ campaignId, ...input }));
}));

aiApi.post('/campaigns/:id/ai/roll', asyncRoute(async (req, res) => {
  const campaignId = z.string().uuid().parse(req.params.id);
  const input = z.object({
    characterId: z.string().uuid(),
    pendingRoll: z.object({
      check_type: z.string().max(40),
      ability: z.enum(['str','dex','con','int','wis','cha']),
      skill: z.string().max(40).nullable().optional(),
      dc: z.number().int().min(1).max(40),
      reason: z.string().max(200),
      modifier: z.number().int().min(-20).max(20).optional(),
      notation: z.string().max(32).optional()
    })
  }).parse(req.body);
  await assertCharacter(input.characterId, campaignId);
  res.status(201).json(await handleRoll({ campaignId, ...input }));
}));
