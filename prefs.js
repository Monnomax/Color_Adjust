import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {RegulatorButton} from './src/regulatorButton.js';
import {
    loadAppOverrides,
    addApp,
    removeApp,
    getAppChannel,
    setAppChannel,
} from './src/appOverrides.js';

const CHANNELS = [
    {key: 'red', title: 'Червоний'},
    {key: 'green', title: 'Зелений'},
    {key: 'blue', title: 'Блакитний'},
];

// Ті самі три канали, але з короткими ключами 'r'/'g'/'b', якими per-app
// насиченість зберігається в JSON-блобі (див. src/appOverrides.js).
const APP_CHANNELS = [
    {channel: 'r', title: 'Червоний'},
    {channel: 'g', title: 'Зелений'},
    {channel: 'b', title: 'Блакитний'},
];

const GROUPS = [
    {prefix: 'saturation', title: 'Насиченість', icon: 'color-select-symbolic'},
];

const DEFAULT_VALUE = 1.0;

// Усі ключі GSettings, якими керує це розширення — використовується
// для експорту/імпорту/скидання. app-overrides свідомо НЕ входить сюди:
// список програм і їхні per-app значення — окрема сутність, яку прибирає
// власна кнопка «Скинути» на вкладці «Програми» не передбачена явно,
// тож поки що глобальний імпорт/експорт/скидання її не чіпає.
const SETTINGS_KEYS = GROUPS.flatMap(({prefix}) =>
    CHANNELS.map(channel => `${prefix}-${channel.key}`));

export default class ChannelColorAdjustPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const colorPage = new Adw.PreferencesPage({
            title: 'Колір монітора',
            icon_name: 'preferences-color-symbolic',
        });

        for (const groupInfo of GROUPS)
            colorPage.add(this._buildGroup(settings, groupInfo));

        colorPage.add(this._buildSettingsGroup(settings, window));

        window.add(colorPage);
        window.add(this._buildAppsPage(settings, window));
    }

    // ---- Вкладка «Колір монітора» (глобальні налаштування) ----

    _buildGroup(settings, {prefix, title, icon, minValue}) {
        const group = new Adw.PreferencesGroup({
            title,
            header_suffix: null,
        });

        for (const channel of CHANNELS) {
            const key = `${prefix}-${channel.key}`;

            const row = new Adw.ActionRow({
                title: channel.title,
            });

            const button = RegulatorButton.forSetting(settings, key, minValue ?? 0.0);

            row.add_suffix(button);
            row.activatable_widget = button;

            group.add(row);
        }

        return group;
    }

    _buildSettingsGroup(settings, window) {
        const group = new Adw.PreferencesGroup({
            title: 'Налаштування',
        });

        const row = new Adw.ActionRow({
            title: 'Дії з налаштуваннями',
        });

        const buttonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            homogeneous: true,
            valign: Gtk.Align.CENTER,
        });

        const importButton = new Gtk.Button({label: 'Імпорт'});
        importButton.connect('clicked', () => this._onImportClicked(settings, window));

        const exportButton = new Gtk.Button({label: 'Експорт'});
        exportButton.connect('clicked', () => this._onExportClicked(settings, window));

        const resetButton = new Gtk.Button({label: 'Скинути'});
        resetButton.add_css_class('destructive-action');
        resetButton.connect('clicked', () => this._onResetClicked(settings, window));

        buttonBox.append(importButton);
        buttonBox.append(exportButton);
        buttonBox.append(resetButton);

        row.add_suffix(buttonBox);
        group.add(row);

        return group;
    }

    _onExportClicked(settings, window) {
        const dialog = new Gtk.FileDialog({
            title: 'Експорт налаштувань',
            initial_name: 'channel-color-adjust.json',
        });

        dialog.save(window, null, (source, result) => {
            let file;
            try {
                file = source.save_finish(result);
            } catch (e) {
                // Користувач скасував діалог — нічого не робимо.
                return;
            }

            const data = {};
            for (const key of SETTINGS_KEYS)
                data[key] = settings.get_double(key);

            const contents = JSON.stringify(data, null, 2);

            try {
                file.replace_contents(
                    new TextEncoder().encode(contents),
                    null, false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null);
            } catch (e) {
                this._showErrorDialog(window, 'Не вдалося зберегти файл', e.message);
            }
        });
    }

    _onImportClicked(settings, window) {
        const filter = new Gtk.FileFilter({name: 'JSON файли'});
        filter.add_pattern('*.json');

        const filterList = new Gio.ListStore({item_type: Gtk.FileFilter});
        filterList.append(filter);

        const dialog = new Gtk.FileDialog({
            title: 'Імпорт налаштувань',
            filters: filterList,
            default_filter: filter,
        });

        dialog.open(window, null, (source, result) => {
            let file;
            try {
                file = source.open_finish(result);
            } catch (e) {
                // Користувач скасував діалог — нічого не робимо.
                return;
            }

            let contentsBytes;
            try {
                [, contentsBytes] = file.load_contents(null);
            } catch (e) {
                this._showErrorDialog(window, 'Не вдалося прочитати файл', e.message);
                return;
            }

            let data;
            try {
                const text = new TextDecoder().decode(contentsBytes);
                data = JSON.parse(text);
            } catch (e) {
                this._showErrorDialog(window, 'Неправильний формат файлу', 'Файл не є коректним JSON.');
                return;
            }

            for (const key of SETTINGS_KEYS) {
                const value = data[key];
                if (typeof value === 'number' && Number.isFinite(value))
                    settings.set_double(key, value);
            }
        });
    }

    _onResetClicked(settings, window) {
        const dialog = new Adw.AlertDialog({
            heading: 'Скинути налаштування?',
            body: 'Усі значення насиченості повернуться до стандартних (1.00).',
        });

        dialog.add_response('cancel', 'Скасувати');
        dialog.add_response('reset', 'Скинути');
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');

        dialog.connect('response', (_dialog, response) => {
            if (response === 'reset') {
                for (const key of SETTINGS_KEYS)
                    settings.set_double(key, DEFAULT_VALUE);
            }
        });

        dialog.present(window);
    }

    _showErrorDialog(window, heading, body) {
        const dialog = new Adw.AlertDialog({heading, body});
        dialog.add_response('ok', 'Гаразд');
        dialog.present(window);
    }

    // ---- Вкладка «Програми» (per-app насиченість) ----

    _buildAppsPage(settings, window) {
        const page = new Adw.PreferencesPage({
            title: 'Програми',
            icon_name: 'preferences-desktop-apps-symbolic',
        });

        page.add(this._buildAddAppGroup(settings, window));

        this._appsPage = page;
        this._appsListGroup = null;
        this._knownAppIds = [];

        this._appOverridesChangedId = settings.connect('changed::app-overrides', () => {
            this._rebuildAppsListIfNeeded(settings);
        });
        page.connect('destroy', () => {
            if (this._appOverridesChangedId) {
                settings.disconnect(this._appOverridesChangedId);
                this._appOverridesChangedId = null;
            }
        });

        this._rebuildAppsListIfNeeded(settings, true);

        return page;
    }

    _buildAddAppGroup(settings, window) {
        const group = new Adw.PreferencesGroup({
            title: 'Додавання',
        });

        const row = new Adw.ActionRow({
            title: 'Додати програму',
        });

        const addButton = this._makeSquareButton(
            'list-add-symbolic', 'Додати програму зі списку встановлених', 'success');
        addButton.connect('clicked', () => this._showAppPicker(settings, window));

        row.add_suffix(addButton);
        row.activatable_widget = addButton;
        group.add(row);

        return group;
    }

    _makeSquareButton(iconName, tooltip, className = 'flat') {
        const button = new Gtk.Button({
            icon_name: iconName,
            tooltip_text: tooltip,
            valign: Gtk.Align.CENTER,
            width_request: 32,
            height_request: 32,
        });
        button.add_css_class(className);
        return button;
    }

    // Перебудовує групу «Список програм» лише тоді, коли справді змінився
    // НАБІР програм (додавання/видалення), а не при кожній зміні одного
    // повзунка всередині — інакше зміна app-overrides під час прокрутки
    // регулятора смикала б увесь список.
    _rebuildAppsListIfNeeded(settings, force = false) {
        const overrides = loadAppOverrides(settings);
        const ids = Object.keys(overrides);

        const unchanged = !force &&
            ids.length === this._knownAppIds.length &&
            ids.every((id, i) => id === this._knownAppIds[i]);
        if (unchanged)
            return;

        this._knownAppIds = ids;

        if (this._appsListGroup) {
            this._appsPage.remove(this._appsListGroup);
            this._appsListGroup = null;
        }

        if (ids.length === 0)
            return;

        const group = new Adw.PreferencesGroup({
            title: 'Список програм',
        });

        for (const appId of ids)
            group.add(this._buildAppExpanderRow(settings, appId));

        this._appsPage.add(group);
        this._appsListGroup = group;
    }

    _buildAppExpanderRow(settings, appId) {
        const appInfo = Gio.DesktopAppInfo.new(appId);
        const title = appInfo ? appInfo.get_display_name() : appId;

        const expander = new Adw.ExpanderRow({title});

        const icon = appInfo?.get_icon();
        if (icon)
            expander.add_prefix(Gtk.Image.new_from_gicon(icon));

        const removeButton = this._makeSquareButton(
            'list-remove-symbolic', `Видалити «${title}» зі списку`, 'destructive-action');
        removeButton.connect('clicked', () => removeApp(settings, appId));
        expander.add_suffix(removeButton);

        for (const {channel, title: channelTitle} of APP_CHANNELS) {
            const channelRow = new Adw.ActionRow({title: channelTitle});

            const button = RegulatorButton.forValue({
                getValue: () => getAppChannel(settings, appId, channel),
                setValue: value => setAppChannel(settings, appId, channel, value),
            });

            channelRow.add_suffix(button);
            channelRow.activatable_widget = button;

            expander.add_row(channelRow);
        }

        return expander;
    }

    _showAppPicker(settings, window) {
        const existing = new Set(Object.keys(loadAppOverrides(settings)));

        const apps = Gio.AppInfo.get_all()
            .filter(app => app.should_show() && !existing.has(app.get_id()))
            .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));

        const picker = new Gtk.Window({
            title: 'Додати програму',
            default_width: 400,
            default_height: 500,
            modal: true,
            transient_for: window,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        const search = new Gtk.SearchEntry({placeholder_text: 'Пошук програми…'});
        box.append(search);

        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
        });
        listBox.add_css_class('boxed-list');

        for (const app of apps) {
            const rowBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                margin_top: 6,
                margin_bottom: 6,
                margin_start: 6,
                margin_end: 6,
            });

            const appIcon = app.get_icon()
                ? Gtk.Image.new_from_gicon(app.get_icon())
                : Gtk.Image.new_from_icon_name('application-x-executable-symbolic');
            appIcon.set_pixel_size(32);

            const label = new Gtk.Label({
                label: app.get_display_name(),
                xalign: 0,
                hexpand: true,
            });

            rowBox.append(appIcon);
            rowBox.append(label);

            const row = new Gtk.ListBoxRow();
            row.set_child(rowBox);
            row.set_name(app.get_id());
            row._searchText = app.get_display_name().toLowerCase();

            listBox.append(row);
        }

        listBox.set_filter_func(row => {
            const text = search.get_text().toLowerCase();
            return !text || row._searchText.includes(text);
        });
        search.connect('search-changed', () => listBox.invalidate_filter());

        listBox.connect('row-activated', (_box, row) => {
            addApp(settings, row.get_name());
            picker.close();
        });

        const scrolled = new Gtk.ScrolledWindow({vexpand: true});
        scrolled.set_child(listBox);
        box.append(scrolled);

        picker.set_child(box);
        picker.present();
    }
}
