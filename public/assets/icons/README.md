# D&D Realm — icon pack

Набор интерфейсных SVG-иконок для игрового проекта. Все значки имеют сетку 24×24, скруглённые линии и используют `currentColor`, поэтому цвет задаётся обычным CSS.

## Структура

- `icons/navigation/` — основное меню.
- `icons/stats/` — параметры персонажа.
- `icons/actions/` — кнопки и быстрые действия.
- `icons/status/` — временные эффекты и состояния.
- `icon-map.json` — соответствие файлов элементам интерфейса.
- `example.css` — пример подключения и состояний.

## Подключение

```html
<button class="realm-button">
  <img class="realm-icon" src="/assets/icons/actions/dice.svg" alt="">
  Бросить кубики
</button>
```

SVG не содержит встроенного цвета. Для смены цвета через `currentColor` вставляйте SVG как компонент/спрайт либо используйте CSS mask, пример есть в `example.css`.

