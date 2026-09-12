import { transaction } from './db.js';

export async function returnSceneItem({ campaignId, sessionId, actorId, characterId, sceneItemId, destination = null }) {
  return transaction(async (client) => {
    const character = (await client.query(
      'SELECT * FROM characters WHERE id=$1::uuid AND campaign_id=$2::uuid FOR SHARE',
      [characterId, campaignId]
    )).rows[0];
    if (!character) throw Object.assign(new Error('Персонаж не найден в кампании'), { status: 404 });

    const scene = (await client.query(`
      SELECT *
      FROM scene_items
      WHERE id=$1::uuid
        AND campaign_id=$2::uuid
        AND character_id=$3::uuid
        AND status='TAKEN'
      FOR UPDATE`, [sceneItemId, campaignId, characterId])).rows[0];
    if (!scene) throw Object.assign(new Error('Предмет не найден среди взятых предметов этой сцены'), { status: 409 });

    let itemId = scene.item_id;
    if (!itemId) {
      const candidates = (await client.query(`
        SELECT ie.id AS inventory_entry_id, ie.item_id, i.name, i.description
        FROM inventory_entries ie
        JOIN items i ON i.id=ie.item_id
        WHERE ie.character_id=$1::uuid
          AND i.campaign_id=$2::uuid
          AND i.name=$3
          AND COALESCE(i.description,'')=COALESCE($4,'')
          AND ie.quantity > 0
        LIMIT 2`, [characterId, campaignId, scene.name, scene.description])).rows;
      if (candidates.length !== 1) {
        throw Object.assign(new Error('Не удалось однозначно сопоставить предмет сцены с инвентарём'), { status: 409 });
      }
      itemId = candidates[0].item_id;
      await client.query('UPDATE scene_items SET item_id=$1::uuid WHERE id=$2::uuid', [itemId, scene.id]);
    }

    const entry = (await client.query(`
      SELECT ie.*, i.name, i.description
      FROM inventory_entries ie
      JOIN items i ON i.id=ie.item_id
      WHERE ie.character_id=$1::uuid
        AND ie.item_id=$2::uuid
        AND ie.quantity > 0
      FOR UPDATE`, [characterId, itemId])).rows[0];
    if (!entry) throw Object.assign(new Error('Предмет отсутствует в инвентаре персонажа'), { status: 409 });

    const remaining = Number(entry.quantity) - 1;
    if (remaining > 0) {
      await client.query('UPDATE inventory_entries SET quantity=$1 WHERE id=$2::uuid', [remaining, entry.id]);
    } else {
      await client.query('DELETE FROM inventory_entries WHERE id=$1::uuid', [entry.id]);
    }

    const requestedDestination = String(destination?.description || '').trim().slice(0, 300);
    const destinationType = String(destination?.type || 'ORIGINAL_LOCATION').toUpperCase();
    const finalDestination = requestedDestination || (destinationType === 'ORIGINAL_LOCATION' ? 'место, откуда предмет был взят' : 'текущее место в сцене');
    const nextDescription = destinationType === 'ORIGINAL_LOCATION'
      ? scene.description
      : `${entry.description || scene.description || entry.name}. Сейчас находится: ${finalDestination}.`;
    const nextSpec = {
      ...(scene.item_spec && typeof scene.item_spec === 'object' ? scene.item_spec : {}),
      location: finalDestination,
      location_type: destinationType
    };

    await client.query(`
      UPDATE scene_items
      SET status='AVAILABLE', taken_at=NULL, item_id=$1::uuid, description=$2, item_spec=$3::jsonb
      WHERE id=$4::uuid`, [itemId, nextDescription, JSON.stringify(nextSpec), scene.id]);

    const resultEvent = (await client.query(`
      INSERT INTO game_events(campaign_id,session_id,actor_character_id,event_type,aggregate_type,aggregate_id,payload)
      VALUES($1::uuid,$2::uuid,$3::uuid,'ITEM_RETURNED','SCENE_ITEM',$4::uuid,$5)
      RETURNING *`, [campaignId, sessionId || null, actorId || characterId, scene.id, {
        sceneItemId: scene.id,
        itemId,
        itemName: entry.name,
        quantity: 1,
        remainingInventoryQuantity: Math.max(0, remaining),
        destinationType,
        destination: finalDestination
      }])).rows[0];

    await client.query(`
      INSERT INTO journal_entries(campaign_id,session_id,author_character_id,entry_type,title,body,tags)
      VALUES($1::uuid,$2::uuid,$3::uuid,'EVENT',$4,$5,$6)`, [
        campaignId,
        sessionId || null,
        characterId,
        'Предмет возвращён',
        `${character.name} оставил(а) предмет «${entry.name}» ${finalDestination}.`,
        ['инвентарь','возврат']
      ]);

    return {
      event: resultEvent,
      sceneItem: { ...scene, status: 'AVAILABLE', item_id: itemId, description: nextDescription, item_spec: nextSpec },
      item: { id: itemId, name: entry.name, description: entry.description },
      destination: { type: destinationType, description: finalDestination },
      remainingInventoryQuantity: Math.max(0, remaining)
    };
  });
}
