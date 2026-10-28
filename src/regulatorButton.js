import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

const MIN_VALUE = 0.0;
const MAX_VALUE = 2.0;
const STEP = 0.05;
const DEFAULT_VALUE = 1.0;

// Кнопка-регулятор: показує поточне значення, змінюється прокруткою
// коліщатка миші (вгору = +STEP, вниз = -STEP), клік скидає до 1.00.
//
// Віддалена від конкретного джерела даних: приймає getValue()/setValue()
// замість того, щоб напряму знати про Gio.Settings. Це дозволяє
// перевикористовувати той самий віджет як для звичайних ключів схеми
// (RegulatorButton.forSetting — глобальні канали на вкладці «Колір
// монітора»), так і для значень усередині довільного сховища —
// наприклад, поля в JSON-блобі per-app налаштувань, де немає окремого
// ключа GSettings на кожну програму й канал (RegulatorButton.forValue).
export const RegulatorButton = GObject.registerClass(
class RegulatorButton extends Gtk.Button {
    _init({
        getValue,
        setValue,
        minValue = MIN_VALUE,
        maxValue = MAX_VALUE,
        step = STEP,
        defaultValue = DEFAULT_VALUE,
        subscribe = null,
    }) {
        super._init({
            valign: Gtk.Align.CENTER,
            width_request: 72,
            tooltip_text: 'Прокрутка — змінити значення, клік — скинути до 1.00',
        });

        this._getValue = getValue;
        this._setValueFn = setValue;
        this._minValue = minValue;
        this._maxValue = maxValue;
        this._step = step;
        this._defaultValue = defaultValue;

        this._value = this._getValue();
        if (this._value < this._minValue) {
            this._value = this._minValue;
            this._setValueFn(this._value);
        }

        this.add_css_class('numeric');
        this._updateLabel();

        const scrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL |
                    Gtk.EventControllerScrollFlags.DISCRETE,
        });
        scrollController.connect('scroll', (_controller, _dx, dy) => {
            this._adjustValue(dy > 0 ? -this._step : this._step);
            return Gdk.EVENT_STOP;
        });
        this.add_controller(scrollController);

        this.connect('clicked', () => this._setValue(this._defaultValue));

        this._unsubscribe = null;
        if (subscribe) {
            this._unsubscribe = subscribe(() => {
                this._value = this._getValue();
                this._updateLabel();
            });
        }

        this.connect('destroy', () => {
            if (this._unsubscribe) {
                this._unsubscribe();
                this._unsubscribe = null;
            }
        });
    }

    // Прив'язка до звичайного ключа GSettings (поведінка як і раніше).
    static forSetting(settings, key, minValue = MIN_VALUE) {
        return new RegulatorButton({
            getValue: () => settings.get_double(key),
            setValue: value => settings.set_double(key, value),
            minValue,
            subscribe: callback => {
                const id = settings.connect(`changed::${key}`, callback);
                return () => settings.disconnect(id);
            },
        });
    }

    // Прив'язка до довільної пари getValue/setValue — наприклад, до поля
    // всередині JSON-блоба з per-app налаштуваннями.
    static forValue({getValue, setValue, minValue, maxValue, step, defaultValue, subscribe}) {
        return new RegulatorButton({getValue, setValue, minValue, maxValue, step, defaultValue, subscribe});
    }

    _adjustValue(delta) {
        this._setValue(this._value + delta);
    }

    _setValue(value) {
        value = Math.min(this._maxValue, Math.max(this._minValue, value));
        // округлення до кроку, щоб уникнути похибок float (0.1 + 0.05 і т.п.)
        value = Math.round(value / this._step) * this._step;
        value = Math.round(value * 100) / 100;

        this._value = value;
        this._setValueFn(value);
        this._updateLabel();
    }

    _updateLabel() {
        this.set_label(this._value.toFixed(2));
    }
});
