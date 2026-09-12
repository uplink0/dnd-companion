import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { handlePlayerMessage, handleRoll } from './ai-master.js';
import { pool, transaction } from './db.js';

export const aiApi = Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

async function assertCharacter(characterId, campaignId) {
  const { rows } = await pool.query('SELECT id FROM characters WHERE id=$1::uuid AND campaign_id=$2::uuid AND kind=\'PLAYER\'', [characterId, campaignId]);
  if (!rows[0]) throw Object.assign(new Error('Активный персонаж не найден в этой кампании'), { status: 404 });
}

async function claimAction({ campaignId, characterId, clientActionId, actionType }) {
  return transaction(async (client) => {
    const existing = (await client.query(`SELECT * FROM action_receipts WHERE campaign_id=$1::uuid AND character_id=$2::uuid AND client_action_id=$3::uuid FOR UPDATE`, [campaignId, characterId, clientActionId])).rows[0];
    if (existing) {
      if (existing.action_type !== actionType) throw Object.assign(new Error('Идентификатор действия уже использован для другого типа действия'), { status: 409 });
      if (existing.response?.status === 'pending') throw Object.assign(new Error('Предыдущее действие ещё выполняется'), { status: 409 });
      if (existing.response?.status === 'failed') {
        await client.query('DELETE FROM action_receipts WHERE id=$1::uuid', [existing.id]);
        return { existing: null };
      }
      return { existing };
    }
    const { rows } = await client.query(`INSERT INTO action_receipts(campaign_id,character_id,client_action_id,action_type,response) VALUES($1::uuid,$2::uuid,$3::uuid,$4,'{"status":"pending"}'::jsonb) RETURNING *`, [campaignId, characterId, clientActionId, actionType]);
    return { existing: rows[0] };
  });
}

async function finishAction({ campaignId, characterId, clientActionId, response }) {
  await pool.query(`UPDATE action_receipts SET response=$4::jsonb WHERE campaign_id=$1::uuid AND character_id=$2::uuid AND client_action_id=$3::uuid`, [campaignId, characterId, clientActionId, JSON.stringify({ status:'done', response })]);
}

async function failAction({ campaignId, characterId, clientActionId, error }) {
  await pool.query(`UPDATE action_receipts SET response=$4::jsonb WHERE campaign_id=$1::uuid AND character_id=$2::uuid AND client_action_id=$3::uuid`, [campaignId, characterId, clientActionId, JSON.stringify({ status:'failed', error })]);
}

function receiptResponse(receipt) { return receipt?.response?.status === 'done' ? receipt.response.response : null; }

aiApi.post('/campaigns/:id/ai/messages', asyncRoute(async (req, res) => {
  const campaignId = z.string().uuid().parse(req.params.id);
  const input = z.object({ characterId:z.string().uuid(), body:z.string().trim().min(1).max(4000), clientActionId:z.string().uuid().optional() }).parse(req.body);
  await assertCharacter(input.characterId,campaignId);
  const clientActionId = input.clientActionId || randomUUID();
  const claim = await claimAction({ campaignId, characterId:input.characterId, clientActionId, actionType:'PLAYER_MESSAGE' });
  const cached = receiptResponse(claim.existing);
  if (cached) return res.status(200).json(cached);
  try {
    const result = await handlePlayerMessage({campaignId,...input});
    await finishAction({campaignId, characterId:input.characterId, clientActionId, response:result});
    res.status(201).json(result);
  } catch (error) {
    await failAction({campaignId, characterId:input.characterId, clientActionId, error:error.message});
    throw error;
  }
}));

aiApi.post('/campaigns/:id/ai/roll', asyncRoute(async (req,res) => {
  const campaignId=z.string().uuid().parse(req.params.id);
  const input=z.object({characterId:z.string().uuid(),masterMessageId:z.string().uuid(),clientActionId:z.string().uuid().optional()}).parse(req.body);
  await assertCharacter(input.characterId,campaignId);
  const clientActionId = input.clientActionId || randomUUID();
  const claim = await claimAction({ campaignId, characterId:input.characterId, clientActionId, actionType:'ROLL' });
  const cached = receiptResponse(claim.existing);
  if (cached) return res.status(200).json(cached);
  try {
    const result = await handleRoll({campaignId,...input});
    await finishAction({campaignId, characterId:input.characterId, clientActionId, response:result});
    res.status(201).json(result);
  } catch (error) {
    await failAction({campaignId, characterId:input.characterId, clientActionId, error:error.message});
    throw error;
  }
}));
