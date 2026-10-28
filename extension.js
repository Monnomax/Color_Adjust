import Shell from "gi://Shell";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { ChannelColorEffect } from "./src/colorEffect.js";
import { loadAppOverrides } from "./src/appOverrides.js";

const EFFECT_NAME = "channel-color-adjust";

const SETTINGS_KEYS = {
    satR: "saturation-red",
    satG: "saturation-green",
    satB: "saturation-blue",
};

export default class ChannelColorAdjustExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._effect = new ChannelColorEffect();

        global.stage.add_effect_with_name(EFFECT_NAME, this._effect);

        this._settingsChangedId = this._settings.connect("changed", () => {
            this._updateEffect();
        });

        // Насиченість per-app (вкладка «Програми») діє тільки поки вікно
        // цієї програми у фокусі й не згорнуте — тому додатково стежимо за
        // зміною фокусного вікна, а не лише за GSettings.
        this._focusWindowChangedId = global.display.connect(
            "notify::focus-window",
            () => this._updateEffect(),
        );

        this._updateEffect();

        this._patchScreenshot();
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._focusWindowChangedId) {
            global.display.disconnect(this._focusWindowChangedId);
            this._focusWindowChangedId = null;
        }

        if (this._effect) {
            global.stage.remove_effect(this._effect);
            this._effect = null;
        }

        this._settings = null;
        if (this._origScreenshotStageToContent) {
            Shell.Screenshot.prototype.screenshot_stage_to_content =
                this._origScreenshotStageToContent;
            this._origScreenshotStageToContent = null;
        }
    }

    // Якщо у фокусі (і не згорнуте) вікно програми, для якої на вкладці
    // «Програми» задано власну насиченість каналів — повертає її {r, g, b}.
    // Інакше — null, і тоді для насиченості діють глобальні налаштування
    // з першої вкладки.
    _activeAppSaturationOverride() {
        const focusWindow = global.display.focus_window;
        if (!focusWindow || focusWindow.minimized) return null;

        const app =
            Shell.WindowTracker.get_default().get_window_app(focusWindow);
        if (!app) return null;

        const overrides = loadAppOverrides(this._settings);
        return overrides[app.get_id()] ?? null;
    }

    _patchScreenshot() {
        const proto = Shell.Screenshot.prototype;

        if (typeof proto.screenshot_stage_to_content !== "function") {
            // На випадок іншої версії Shell — тут можна додати fallback
            // на старіші назви (screenshot / screenshot_area / screenshot_window).
            return;
        }

        const orig = proto.screenshot_stage_to_content;
        const extension = this;

        this._origScreenshotStageToContent = orig;

        proto.screenshot_stage_to_content = function (...args) {
            // `this` всередині — конкретний екземпляр Shell.Screenshot,
            // тому важливо викликати оригінал через .apply(this, ...).
            if (extension._effect) extension._effect.set_enabled(false);

            const result = orig.apply(this, args);

            Promise.resolve(result).finally(() => {
                if (extension._effect) {
                    extension._effect.set_enabled(true);
                    global.stage.queue_redraw();
                }
            });

            return result;
        };
    }

    _updateEffect() {
        if (!this._effect || !this._settings) return;

        const values = {};
        for (const [propName, settingsKey] of Object.entries(SETTINGS_KEYS))
            values[propName] = this._settings.get_double(settingsKey);

        const override = this._activeAppSaturationOverride();
        if (override) {
            values.satR = override.r ?? values.satR;
            values.satG = override.g ?? values.satG;
            values.satB = override.b ?? values.satB;
        }

        this._effect.setChannelValues(values);
    }
}
