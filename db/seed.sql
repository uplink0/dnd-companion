INSERT INTO users(id,display_name) VALUES ('00000000-0000-4000-8000-000000000001','Игрок') ON CONFLICT DO NOTHING;
INSERT INTO campaigns(id,owner_id,name,description,chapter) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Забытые руины','Исследование древнего святилища в горах.','Глава 3: Врата в Туман') ON CONFLICT DO NOTHING;
INSERT INTO campaign_members VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','OWNER') ON CONFLICT DO NOTHING;
INSERT INTO sessions(id,campaign_id,title) VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Руины храма') ON CONFLICT DO NOTHING;
INSERT INTO locations(id,campaign_id,name,description,x,y,discovered,visited) VALUES
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Руины Храма','Древнее святилище, скрытое в горах.',54,42,true,true) ON CONFLICT DO NOTHING;
INSERT INTO items(id,campaign_id,name,item_type,rarity,description,weight,base_value_gp,properties) VALUES
('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Потёртая лампа','WONDROUS','RARE','Старая латунная лампа с неразличимыми рунами.',1,250,'[{"key":"summon","name":"Призыв джинна","secret":false},{"key":"curse","name":"Печать хозяина","secret":true}]'),
('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Зелье лечения','POTION','COMMON','Восстанавливает 2d4+2 HP.',0.5,50,'[{"key":"heal","formula":"2d4+2","secret":false}]') ON CONFLICT DO NOTHING;
INSERT INTO quests(id,campaign_id,title,description,status,source_type,recommended_level,reward) VALUES
('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Свет под алтарём','Узнать, что питает кристалл в нижнем святилище.','ACTIVE','ITEM',5,'{"xp":500,"gp":120}'),
('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','След пропавшей экспедиции','Найти записи исследователей.','AVAILABLE','NOTICE_BOARD',4,'{"xp":350}') ON CONFLICT DO NOTHING;
INSERT INTO quest_objectives(quest_id,title,current_value,target_value,sort_order) VALUES
('70000000-0000-4000-8000-000000000001','Осмотреть кристалл',1,1,1),
('70000000-0000-4000-8000-000000000001','Расшифровать символ культа',0,1,2)
ON CONFLICT DO NOTHING;
