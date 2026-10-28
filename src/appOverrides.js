// Спільні хелпери для роботи з JSON-блобом у ключі GSettings 'app-overrides'.
// Використовуються і в extension.js (застосування ефекту до фокусного вікна),
// і в prefs.js (редагування у вкладці «Програми») — щоб формат даних
// {"<appId>": {r, g, b}} не розійшовся між двома процесами.
//
// r/g/b тут — це НАСИЧЕНІСТЬ каналу для конкретної програми (аналог групи
// «Насиченість» на вкладці «Колір монітора»).

const SETTINGS_KEY = 'app-overrides';
const DEFAULT_CHANNELS = {r: 1.0, g: 1.0, b: 1.0};

export function loadAppOverrides(settings) {
    try {
        const raw = settings.get_string(SETTINGS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

export function saveAppOverrides(settings, overrides) {
    settings.set_string(SETTINGS_KEY, JSON.stringify(overrides));
}

// Додає програму зі стандартними (нейтральними) значеннями насиченості,
// якщо вона ще не в списку.
export function addApp(settings, appId) {
    const overrides = loadAppOverrides(settings);
    if (!overrides[appId])
        overrides[appId] = {...DEFAULT_CHANNELS};
    saveAppOverrides(settings, overrides);
}

// Видаляє конкретну програму зі списку.
export function removeApp(settings, appId) {
    const overrides = loadAppOverrides(settings);
    if (!(appId in overrides))
        return;
    delete overrides[appId];
    saveAppOverrides(settings, overrides);
}

export function getAppChannel(settings, appId, channel) {
    const overrides = loadAppOverrides(settings);
    return overrides[appId]?.[channel] ?? DEFAULT_CHANNELS[channel];
}

export function setAppChannel(settings, appId, channel, value) {
    const overrides = loadAppOverrides(settings);
    if (!overrides[appId])
        overrides[appId] = {...DEFAULT_CHANNELS};
    overrides[appId][channel] = value;
    saveAppOverrides(settings, overrides);
}
