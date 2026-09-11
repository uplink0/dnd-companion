INSERT INTO users(id,display_name) VALUES ('00000000-0000-4000-8000-000000000001','Игрок') ON CONFLICT DO NOTHING;
INSERT INTO campaigns(id,owner_id,name,description,chapter) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Забытые руины','Исследование древнего святилища в горах.','Глава 3: Врата в Туман') ON CONFLICT DO NOTHING;
INSERT INTO campaign_members VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','OWNER') ON CONFLICT DO NOTHING;
INSERT INTO characters(id,campaign_id,user_id,kind,name,race,class_name,subclass,background,rank,level,xp,xp_next,hp,hp_max,armor_class,initiative,proficiency_bonus,spell_save_dc,spell_attack_bonus,hit_dice,abilities,saving_throw_proficiencies,skill_proficiencies,proficiencies,languages,senses,traits,biography) VALUES
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','PLAYER','Элдрик Серебряный Ветер','Высший эльф','Чародей','Дикая магия','Исследователь древних руин','Искатель',5,6240,14000,32,32,15,2,3,15,7,'5d6','{"str":8,"dex":14,"con":12,"int":18,"wis":13,"cha":16}','{"int","cha"}','{"arcana":"proficient","history":"proficient","investigation":"proficient"}','{"Лёгкие арбалеты","Кинжалы","Посохи"}','{"Общий","Эльфийский","Драконий"}','{"darkvision":60}','[{"name":"Фейское происхождение"},{"name":"Транс"}]','Эльфийский чародей, исследователь древних руин и знаток тайной магии.') ON CONFLICT DO NOTHING;
INSERT INTO characters(id,campaign_id,kind,name,race,class_name,rank,level,xp,xp_next,hp,hp_max,armor_class,initiative,abilities,biography) VALUES
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','COMPANION','Лира','Человек','Следопыт','Союзник',5,6500,14000,41,41,16,4,'{"str":11,"dex":18,"con":14,"int":10,"wis":16,"cha":12}','Следопыт, который чувствует опасность раньше остальных и помнит каждую тропу.'),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','COMPANION','Бром','Дварф','Воин','Союзник',5,7100,14000,48,48,18,1,'{"str":18,"dex":10,"con":18,"int":9,"wis":12,"cha":10}','Дварф-воин, для которого слово и клятва тяжелее стального щита.'),
('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','COMPANION','Селена','Дроу','Жрец','Союзник',5,6020,14000,36,36,17,1,'{"str":9,"dex":14,"con":12,"int":12,"wis":18,"cha":14}','Дроу-жрец, хранящая тайны старого культа и умеющая говорить с теми, кто давно молчит.') ON CONFLICT DO NOTHING;
INSERT INTO party_members(campaign_id,character_id,recruitment_type) VALUES
('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','START'),
('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','INVITED'),
('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','INVITED'),
('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','INVITED') ON CONFLICT DO NOTHING;
INSERT INTO sessions(id,campaign_id,title) VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Руины храма') ON CONFLICT DO NOTHING;
INSERT INTO locations(id,campaign_id,name,description,x,y,discovered,visited) VALUES
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Руины Храма','Древнее святилище, скрытое в горах.',54,42,true,true) ON CONFLICT DO NOTHING;
INSERT INTO items(id,campaign_id,name,item_type,rarity,description,weight,base_value_gp,properties) VALUES
('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Потёртая лампа','WONDROUS','RARE','Старая латунная лампа с неразличимыми рунами.',1,250,'[{"key":"summon","name":"Призыв джинна","secret":false},{"key":"curse","name":"Печать хозяина","secret":true}]'),
('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Зелье лечения','POTION','COMMON','Восстанавливает 2d4+2 HP.',0.5,50,'[{"key":"heal","formula":"2d4+2","secret":false}]') ON CONFLICT DO NOTHING;
INSERT INTO inventory_entries(id,character_id,item_id,quantity) VALUES
('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',1),
('60000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',2) ON CONFLICT DO NOTHING;
INSERT INTO item_discoveries VALUES ('60000000-0000-4000-8000-000000000001','summon','ARCANA',now()) ON CONFLICT DO NOTHING;
INSERT INTO quests(id,campaign_id,title,description,status,source_type,recommended_level,reward) VALUES
('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Свет под алтарём','Узнать, что питает кристалл в нижнем святилище.','ACTIVE','ITEM',5,'{"xp":500,"gp":120}'),
('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','След пропавшей экспедиции','Найти записи исследователей.','AVAILABLE','NOTICE_BOARD',4,'{"xp":350}') ON CONFLICT DO NOTHING;
INSERT INTO quest_objectives(quest_id,title,current_value,target_value,sort_order) VALUES
('70000000-0000-4000-8000-000000000001','Осмотреть кристалл',1,1,1),
('70000000-0000-4000-8000-000000000001','Расшифровать символ культа',0,1,2)
ON CONFLICT DO NOTHING;
INSERT INTO messages(campaign_id,session_id,character_id,role,body) SELECT '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','PLAYER','Я подхожу к алтарю и внимательно осматриваю свиток.' WHERE NOT EXISTS (SELECT 1 FROM messages);
INSERT INTO messages(campaign_id,session_id,character_id,role,body) SELECT '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','MASTER','Свиток выглядит старым, но хорошо сохранившимся. На нём — символ культа. Что вы хотите сделать дальше?' WHERE (SELECT count(*) FROM messages WHERE role='PLAYER')=1 AND NOT EXISTS (SELECT 1 FROM messages WHERE role='MASTER');
