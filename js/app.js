// ==================== D&D COMPANION APP ====================

// Mock Data
const mockData = {
    character: {
        name: 'Arthas',
        race: 'Human',
        class: 'Paladin',
        level: 5,
        hp: 42,
        maxHp: 48,
        ac: 18,
        initiative: 2,
        speed: 30,
        proficiency: 3,
        stats: {
            STR: { value: 16, mod: 3 },
            DEX: { value: 12, mod: 1 },
            CON: { value: 14, mod: 2 },
            INT: { value: 10, mod: 0 },
            WIS: { value: 13, mod: 1 },
            CHA: { value: 18, mod: 4 }
        },
        spells: [
            { name: 'Fireball', level: 3, school: 'Evocation', castingTime: '1 Action', range: '150 ft', components: 'V, S, M' },
            { name: 'Magic Missile', level: 1, school: 'Evocation', castingTime: '1 Action', range: '120 ft', components: 'V, S' },
            { name: 'Cure Wounds', level: 1, school: 'Evocation', castingTime: '1 Action', range: 'Touch', components: 'V, S' },
            { name: 'Shield', level: 1, school: 'Abjuration', castingTime: '1 Reaction', range: 'Self', components: 'V, S' },
            { name: 'Lightning Bolt', level: 3, school: 'Evocation', castingTime: '1 Action', range: 'Self (100 ft line)', components: 'V, S, M' },
            { name: 'Bless', level: 1, school: 'Enchantment', castingTime: '1 Action', range: '30 ft', components: 'V, S, M' },
            { name: 'Counterspell', level: 3, school: 'Abjuration', castingTime: '1 Reaction', range: '60 ft', components: 'S' },
            { name: 'Detect Magic', level: 1, school: 'Divination', castingTime: '1 Action', range: 'Self', components: 'V, S' }
        ],
        inventory: [
            { name: 'Longsword', category: 'Weapons', quantity: 1, weight: 3, value: 15 },
            { name: 'Potion of Healing', category: 'Potions', quantity: 3, weight: 0.5, value: 50 },
            { name: 'Rope (50 ft)', category: 'Tools', quantity: 1, weight: 10, value: 1 },
            { name: 'Magic Ring', category: 'Magic', quantity: 1, weight: 0.1, value: 500 },
            { name: 'Chain Mail', category: 'Armor', quantity: 1, weight: 55, value: 75 },
            { name: 'Shield', category: 'Armor', quantity: 1, weight: 6, value: 10 },
            { name: 'Torch', category: 'Tools', quantity: 5, weight: 1, value: 0.01 },
            { name: 'Rations', category: 'Other', quantity: 7, weight: 2, value: 0.5 }
        ]
    },
    campaign: {
        name: 'Таверна «Мокрый Торг»',
        session: 12,
        dm: 'Gandalf',
        players: [
            { name: 'Arthas', class: 'Paladin', level: 5, hp: 42, maxHp: 48, avatar: 'A' },
            { name: 'Legolas', class: 'Ranger', level: 5, hp: 38, maxHp: 44, avatar: 'L' },
            { name: 'Gandalf', class: 'Wizard', level: 5, hp: 30, maxHp: 36, avatar: 'G' },
            { name: 'Aragorn', class: 'Fighter', level: 5, hp: 46, maxHp: 52, avatar: 'A' },
            { name: 'Gimli', class: 'Barbarian', level: 5, hp: 52, maxHp: 58, avatar: 'G' }
        ],
        quests: [
            { name: 'Тени под старой башней', progress: 80, reward: '250 XP', status: 'active' },
            { name: 'Спасти кузнеца', progress: 100, reward: '150 XP', status: 'completed' },
            { name: 'Гоблинские пещеры', progress: 45, reward: '300 XP', status: 'active' }
        ],
        locations: [
            { name: 'Таверна «Мокрый Торг»', type: 'Таверна', description: 'Центр города' },
            { name: 'Старая башня', type: 'Подземелье', description: 'Заброшенная башня мага' },
            { name: 'Тёмный лес', type: 'Лес', description: 'Опасный лес' }
        ],
        npcs: [
            { name: 'Трактирщик Барли', role: 'Хозяин таверны', description: 'Добрый, но хитрый' },
            { name: 'Маг Элрон', role: 'Наставник', description: 'Мудрый маг' },
            { name: 'Кузнец Торин', role: 'Кузнец', description: 'Пропал' }
        ]
    },
    combat: {
        round: 4,
        currentTurn: 1,
        participants: [
            { name: 'Goblin', hp: 12, maxHp: 15, initiative: 18, type: 'enemy' },
            { name: 'Arthas', hp: 42, maxHp: 48, initiative: 16, type: 'player' },
            { name: 'Wizard', hp: 21, maxHp: 30, initiative: 13, type: 'player' },
            { name: 'Orc', hp: 28, maxHp: 35, initiative: 9, type: 'enemy' }
        ]
    },
    notes: [
        { title: 'Что сказал трактирщик', content: 'Он упомянул странные звуки из подвала...', date: '2024-01-15' },
        { title: 'Карта подземелья', content: 'Вход через старый колодец', date: '2024-01-14' },
        { title: 'Имя неизвестного мага', content: 'Элрон из Серебряной Башни', date: '2024-01-13' },
        { title: 'Следующий квест', content: 'Спасти кузнеца Торина', date: '2024-01-12' }
    ]
};

// State Management
let currentTheme = localStorage.getItem('dnd-theme') || 'dark';
let rollHistory = JSON.parse(localStorage.getItem('dnd-roll-history')) || [];
let currentHp = mockData.character.hp;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavigation();
    initLucideIcons();
    initPageSpecific();
    initGlobalEvents();
});

function initLucideIcons() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function initTheme() {
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }
    applyTheme();
}

function applyTheme() {
    if (currentTheme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
    localStorage.setItem('dnd-theme', currentTheme);
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme();
    showToast('Тема изменена', 'gold');
}

// ==================== NAVIGATION ====================
function initNavigation() {
    // Get current page from URL
    const path = window.location.pathname;
    const currentPage = path.split('/').pop() || 'index.html';
    
    // Set active nav items
    document.querySelectorAll('[data-nav]').forEach(item => {
        const navPage = item.getAttribute('data-nav');
        if (currentPage === navPage || (currentPage === 'index.html' && navPage === 'index.html')) {
            item.classList.add('active');
        }
    });
    
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.toggle('collapsed');
            }
        });
    }
}

// ==================== GLOBAL EVENTS ====================
function initGlobalEvents() {
    // Modal close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal);
            }
        });
    });
    
    // Modal close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-overlay');
            if (modal) {
                closeModal(modal);
            }
        });
    });
    
    // Back buttons
    document.querySelectorAll('[data-back]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-back');
            if (target) {
                window.location.href = target;
            } else {
                window.history.back();
            }
        });
    });
}

// ==================== PAGE SPECIFIC INITIALIZATION ====================
function initPageSpecific() {
    const path = window.location.pathname;
    const page = path.split('/').pop();
    
    switch(page) {
        case 'dice.html':
            initDiceRoller();
            break;
        case 'character.html':
            initCharacterSheet();
            break;
        case 'inventory.html':
            initInventory();
            break;
        case 'spells.html':
            initSpells();
            break;
        case 'combat.html':
            initCombat();
            break;
        case 'notes.html':
            initNotes();
            break;
        case 'index.html':
        case '':
            initDashboard();
            break;
    }
}

// ==================== DASHBOARD ====================
function initDashboard() {
    const quickActions = document.querySelectorAll('.quick-action');
    quickActions.forEach(action => {
        action.addEventListener('click', () => {
            const target = action.getAttribute('data-target');
            if (target) {
                window.location.href = target;
            }
        });
    });
    
    // Update HP display
    updateHpDisplay();
}

function updateHpDisplay() {
    const hpValueElements = document.querySelectorAll('[data-hp-value]');
    const hpBarElements = document.querySelectorAll('[data-hp-bar]');
    
    hpValueElements.forEach(el => {
        el.textContent = `${currentHp}/${mockData.character.maxHp}`;
    });
    
    hpBarElements.forEach(el => {
        const percentage = (currentHp / mockData.character.maxHp) * 100;
        el.style.width = `${percentage}%`;
    });
}

// ==================== DICE ROLLER ====================
function initDiceRoller() {
    const diceDisplay = document.getElementById('diceDisplay');
    const rollButton = document.getElementById('rollButton');
    const diceTypeButtons = document.querySelectorAll('.dice-type-btn');
    const diceCountInput = document.getElementById('diceCount');
    const diceModifierInput = document.getElementById('diceModifier');
    
    let currentDiceType = 'd20';
    let currentCount = 1;
    let currentModifier = 0;
    
    if (diceTypeButtons) {
        diceTypeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                diceTypeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentDiceType = btn.getAttribute('data-dice');
                updateRollButtonText();
            });
        });
    }
    
    if (diceCountInput) {
        diceCountInput.addEventListener('change', (e) => {
            currentCount = parseInt(e.target.value) || 1;
            updateRollButtonText();
        });
    }
    
    if (diceModifierInput) {
        diceModifierInput.addEventListener('change', (e) => {
            currentModifier = parseInt(e.target.value) || 0;
            updateRollButtonText();
        });
    }
    
    function updateRollButtonText() {
        if (rollButton) {
            rollButton.textContent = `ROLL ${currentDiceType.toUpperCase()}`;
            if (currentCount > 1) {
                rollButton.textContent = `ROLL ${currentCount}${currentDiceType.toUpperCase()}`;
            }
        }
    }
    
    if (rollButton) {
        rollButton.addEventListener('click', () => {
            performRoll(currentDiceType, currentCount, currentModifier);
        });
    }
    
    if (diceDisplay) {
        diceDisplay.addEventListener('click', () => {
            performRoll(currentDiceType, 1, 0);
        });
    }
    
    updateRollHistoryDisplay();
}

function performRoll(diceType, count, modifier) {
    const diceValues = {
        'd4': 4, 'd6': 6, 'd8': 8, 'd10': 10, 'd12': 12, 'd20': 20, 'd100': 100
    };
    
    const maxValue = diceValues[diceType] || 20;
    const rolls = [];
    let total = 0;
    
    for (let i = 0; i < count; i++) {
        const roll = Math.floor(Math.random() * maxValue) + 1;
        rolls.push(roll);
        total += roll;
    }
    
    total += modifier;
    
    const isCritical = diceType === 'd20' && rolls[0] === 20;
    const isFumble = diceType === 'd20' && rolls[0] === 1;
    
    const result = {
        type: diceType,
        count: count,
        modifier: modifier,
        rolls: rolls,
        total: total,
        critical: isCritical,
        fumble: isFumble,
        timestamp: new Date().toISOString()
    };
    
    // Save to history
    rollHistory.unshift(result);
    if (rollHistory.length > 20) {
        rollHistory.pop();
    }
    localStorage.setItem('dnd-roll-history', JSON.stringify(rollHistory));
    
    // Animate dice
    const diceDisplay = document.getElementById('diceDisplay');
    if (diceDisplay) {
        diceDisplay.classList.add('dice-rolling');
        setTimeout(() => {
            diceDisplay.classList.remove('dice-rolling');
        }, 800);
    }
    
    // Display result
    displayRollResult(result);
    updateRollHistoryDisplay();
}

function displayRollResult(result) {
    const resultDisplay = document.getElementById('rollResult');
    if (!resultDisplay) return;
    
    const resultNumber = document.getElementById('resultNumber');
    const resultLabel = document.getElementById('resultLabel');
    
    if (resultNumber) {
        resultNumber.textContent = result.total;
        resultNumber.style.animation = 'none';
        setTimeout(() => {
            resultNumber.style.animation = 'resultAppear 0.5s ease';
        }, 10);
    }
    
    if (resultLabel) {
        let label = `${result.count}${result.type} + ${result.modifier}`;
        if (result.critical) {
            label = 'CRITICAL HIT!';
        } else if (result.fumble) {
            label = 'CRITICAL MISS!';
        }
        resultLabel.textContent = label;
    }
}

function updateRollHistoryDisplay() {
    const historyContainer = document.getElementById('rollHistory');
    if (!historyContainer) return;
    
    if (rollHistory.length === 0) {
        historyContainer.innerHTML = '<div class="text-muted">Пока нет бросков</div>';
        return;
    }
    
    historyContainer.innerHTML = rollHistory.map(roll => {
        const diceLabel = `${roll.count}${roll.type}${roll.modifier ? ' + ' + roll.modifier : ''}`;
        return `
            <div class="history-item">
                <div class="history-dice">${diceLabel}</div>
                <div class="history-result ${roll.critical ? 'critical' : roll.fumble ? 'fumble' : ''}">${roll.total}</div>
            </div>
        `;
    }).join('');
}

// ==================== CHARACTER SHEET ====================
function initCharacterSheet() {
    // HP Controls
    const hpButtons = document.querySelectorAll('[data-hp-change]');
    hpButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const change = parseInt(btn.getAttribute('data-hp-change'));
            updateHp(change);
        });
    });
    
    // Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tabName = btn.getAttribute('data-tab');
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => {
                if (content.id === `tab-${tabName}`) {
                    content.style.display = 'block';
                } else {
                    content.style.display = 'none';
                }
            });
        });
    });
}

function updateHp(change) {
    currentHp = Math.max(0, Math.min(mockData.character.maxHp, currentHp + change));
    updateHpDisplay();
    showToast(`HP: ${currentHp}/${mockData.character.maxHp}`, currentHp < 10 ? 'error' : 'success');
}

// ==================== INVENTORY ====================
function initInventory() {
    const addItemBtn = document.getElementById('addItemBtn');
    const addItemModal = document.getElementById('addItemModal');
    const confirmAddBtn = document.getElementById('confirmAddItem');
    
    if (addItemBtn) {
        addItemBtn.addEventListener('click', () => {
            openModal(addItemModal);
        });
    }
    
    if (confirmAddBtn) {
        confirmAddBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('newItemName');
            const categoryInput = document.getElementById('newItemCategory');
            const quantityInput = document.getElementById('newItemQuantity');
            
            if (nameInput && nameInput.value) {
                const newItem = {
                    name: nameInput.value,
                    category: categoryInput ? categoryInput.value : 'Other',
                    quantity: quantityInput ? parseInt(quantityInput.value) || 1 : 1,
                    weight: 0.5,
                    value: 1
                };
                
                mockData.character.inventory.push(newItem);
                displayInventory();
                closeModal(addItemModal);
                showToast('Предмет добавлен', 'success');
                
                // Clear form
                if (nameInput) nameInput.value = '';
                if (quantityInput) quantityInput.value = '1';
            }
        });
    }
    
    // Category filters
    const categoryButtons = document.querySelectorAll('.category-filter');
    categoryButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const category = btn.getAttribute('data-category');
            displayInventory(category);
        });
    });
    
    displayInventory();
}

function displayInventory(filter = 'all') {
    const container = document.getElementById('inventoryList');
    if (!container) return;
    
    const filteredItems = filter === 'all' 
        ? mockData.character.inventory 
        : mockData.character.inventory.filter(item => item.category === filter);
    
    container.innerHTML = filteredItems.map(item => `
        <div class="inventory-item card">
            <div class="item-icon">${getItemIcon(item.category)}</div>
            <div class="item-info">
                <div class="item-name">${item.name}</div>
                <div class="item-details">${item.category} • ${item.weight} lb</div>
            </div>
            <div class="item-actions">
                <button class="btn-icon" onclick="removeItem('${item.name}')">
                    <i data-lucide="trash-2"></i>
                </button>
                <span class="item-quantity">x${item.quantity}</span>
            </div>
        </div>
    `).join('');
    
    initLucideIcons();
    updateCarryingWeight();
}

function getItemIcon(category) {
    const icons = {
        'Weapons': '⚔️',
        'Armor': '🛡️',
        'Potions': '🧪',
        'Magic': '✨',
        'Tools': '🔧',
        'Other': '📦'
    };
    return icons[category] || '📦';
}

function removeItem(name) {
    const index = mockData.character.inventory.findIndex(item => item.name === name);
    if (index > -1) {
        mockData.character.inventory.splice(index, 1);
        displayInventory();
        showToast('Предмет удалён', 'error');
    }
}

function updateCarryingWeight() {
    const weightElement = document.getElementById('carryingWeight');
    if (!weightElement) return;
    
    const totalWeight = mockData.character.inventory.reduce((sum, item) => sum + (item.weight * item.quantity), 0);
    weightElement.textContent = `${totalWeight} / 90 lb`;
}

// ==================== SPELLS ====================
function initSpells() {
    const searchInput = document.getElementById('spellSearch');
    const filterButtons = document.querySelectorAll('.spell-filter');
    const spellCards = document.querySelectorAll('.spell-card');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterSpells);
    }
    
    if (filterButtons) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterSpells();
            });
        });
    }
    
    spellCards.forEach(card => {
        card.addEventListener('click', () => {
            const spellName = card.getAttribute('data-spell');
            showSpellDetails(spellName);
        });
    });
}

function filterSpells() {
    const searchTerm = document.getElementById('spellSearch')?.value.toLowerCase() || '';
    const activeFilter = document.querySelector('.spell-filter.active')?.getAttribute('data-level') || 'all';
    
    document.querySelectorAll('.spell-card').forEach(card => {
        const spellName = card.getAttribute('data-spell').toLowerCase();
        const spellLevel = card.getAttribute('data-level');
        
        const matchesSearch = spellName.includes(searchTerm);
        const matchesFilter = activeFilter === 'all' || spellLevel === activeFilter;
        
        if (matchesSearch && matchesFilter) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function showSpellDetails(spellName) {
    const spell = mockData.character.spells.find(s => s.name.toLowerCase() === spellName);
    if (!spell) return;
    
    const modal = document.getElementById('spellModal');
    if (!modal) return;
    
    const titleElement = document.getElementById('spellModalTitle');
    const detailsElement = document.getElementById('spellModalDetails');
    
    if (titleElement) {
        titleElement.textContent = spell.name;
    }
    
    if (detailsElement) {
        detailsElement.innerHTML = `
            <div class="spell-details">
                <p><strong>Уровень:</strong> ${spell.level}</p>
                <p><strong>Школа:</strong> ${spell.school}</p>
                <p><strong>Время накладывания:</strong> ${spell.castingTime}</p>
                <p><strong>Дистанция:</strong> ${spell.range}</p>
                <p><strong>Компоненты:</strong> ${spell.components}</p>
            </div>
        `;
    }
    
    openModal(modal);
}

// ==================== COMBAT ====================
function initCombat() {
    const nextTurnBtn = document.getElementById('nextTurnBtn');
    const damageBtn = document.getElementById('damageBtn');
    const healBtn = document.getElementById('healBtn');
    
    if (nextTurnBtn) {
        nextTurnBtn.addEventListener('click', nextTurn);
    }
    
    if (damageBtn) {
        damageBtn.addEventListener('click', () => {
            applyDamage(5);
        });
    }
    
    if (healBtn) {
        healBtn.addEventListener('click', () => {
            applyDamage(-5);
        });
    }
    
    displayCombatants();
}

function displayCombatants() {
    const container = document.getElementById('combatList');
    if (!container) return;
    
    const sortedParticipants = [...mockData.combat.participants].sort((a, b) => b.initiative - a.initiative);
    
    container.innerHTML = sortedParticipants.map((participant, index) => `
        <div class="combatant ${index === mockData.combat.currentTurn ? 'active' : ''}">
            <div class="initiative-order">${index + 1}</div>
            <div class="combatant-info">
                <div class="combatant-name">${participant.name}</div>
                <div class="combatant-hp">HP: ${participant.hp}/${participant.maxHp}</div>
            </div>
            <div class="initiative-value">${participant.initiative}</div>
        </div>
    `).join('');
}

function nextTurn() {
    const participantCount = mockData.combat.participants.length;
    mockData.combat.currentTurn = (mockData.combat.currentTurn + 1) % participantCount;
    
    if (mockData.combat.currentTurn === 0) {
        mockData.combat.round++;
        const roundDisplay = document.getElementById('roundDisplay');
        if (roundDisplay) {
            roundDisplay.textContent = `ROUND ${mockData.combat.round}`;
        }
    }
    
    displayCombatants();
    showToast('Следующий ход', 'gold');
}

function applyDamage(amount) {
    const currentCombatant = mockData.combat.participants[mockData.combat.currentTurn];
    if (!currentCombatant) return;
    
    currentCombatant.hp = Math.max(0, Math.min(currentCombatant.maxHp, currentCombatant.hp - amount));
    displayCombatants();
    
    showToast(`${currentCombatant.name}: ${currentCombatant.hp}/${currentCombatant.maxHp}`, 
        currentCombatant.hp < 10 ? 'error' : 'success');
}

// ==================== NOTES ====================
function initNotes() {
    const addNoteBtn = document.getElementById('addNoteBtn');
    const addNoteModal = document.getElementById('addNoteModal');
    const confirmNoteBtn = document.getElementById('confirmNote');
    
    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', () => {
            openModal(addNoteModal);
        });
    }
    
    if (confirmNoteBtn) {
        confirmNoteBtn.addEventListener('click', () => {
            const titleInput = document.getElementById('noteTitle');
            const contentInput = document.getElementById('noteContent');
            
            if (titleInput && titleInput.value) {
                const newNote = {
                    title: titleInput.value,
                    content: contentInput ? contentInput.value : '',
                    date: new Date().toISOString().split('T')[0]
                };
                
                mockData.notes.unshift(newNote);
                displayNotes();
                closeModal(addNoteModal);
                showToast('Заметка создана', 'success');
                
                if (titleInput) titleInput.value = '';
                if (contentInput) contentInput.value = '';
            }
        });
    }
    
    displayNotes();
}

function displayNotes() {
    const container = document.getElementById('notesList');
    if (!container) return;
    
    container.innerHTML = mockData.notes.map(note => `
        <div class="note-card card" onclick="openNote('${note.title}')">
            <div class="note-title">${note.title}</div>
            <div class="note-date">${note.date}</div>
        </div>
    `).join('');
}

function openNote(title) {
    const note = mockData.notes.find(n => n.title === title);
    if (!note) return;
    
    const modal = document.getElementById('noteModal');
    if (!modal) return;
    
    const titleElement = document.getElementById('noteModalTitle');
    const contentElement = document.getElementById('noteModalContent');
    
    if (titleElement) titleElement.textContent = note.title;
    if (contentElement) contentElement.textContent = note.content;
    
    openModal(modal);
}

// ==================== MODAL MANAGEMENT ====================
function openModal(modal) {
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modal) {
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type = 'gold') {
    const container = document.querySelector('.toast-container');
    if (!container) {
        // Create container if it doesn't exist
        const newContainer = document.createElement('div');
        newContainer.className = 'toast-container';
        document.body.appendChild(newContainer);
        return showToast(message, type);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 3000);
}

// ==================== SETTINGS ====================
function initSettings() {
    const themeButtons = document.querySelectorAll('[data-theme]');
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            setTheme(theme);
        });
    });
    
    // Update active theme button
    themeButtons.forEach(btn => {
        if (btn.getAttribute('data-theme') === currentTheme) {
            btn.classList.add('active');
        }
    });
}

function setTheme(theme) {
    currentTheme = theme;
    applyTheme();
    
    // Update buttons
    document.querySelectorAll('[data-theme]').forEach(btn => {
        if (btn.getAttribute('data-theme') === theme) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    showToast(`Тема: ${theme === 'dark' ? 'Тёмная' : 'Светлая'}`, 'gold');
}

// ==================== EXPOSE FUNCTIONS GLOBALLY ====================
window.removeItem = removeItem;
window.openNote = openNote;
