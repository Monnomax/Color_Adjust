import Shell from 'gi://Shell';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';

// Фрагментний шейдер (як GLSL-сніпет, а не повна заміна main()):
// 1) рахує яскравість пікселя (luminance) за стандартною формулою
// 2) для кожного каналу окремо змішує "сірий" (без кольору) з оригінальним каналом
//
// На відміну від попередньої версії (Clutter.ShaderEffect з повною заміною
// main() і ручним texture2D(tex, ...)), тут використовується
// Shell.GLSLEffect + add_glsl_snippet(): код вбудовується у вже існуючий
// Cogl-пайплайн і працює з уже готовим cogl_color_out, який Cogl сам коректно
// підготував із текстури актора (правильний формат, альфа, свізлінг
// каналів). Це той самий підхід, що й у робочому Display Color Correction.
// Ручний семпл текстури через власний sampler2D "tex" ненадійний саме тоді,
// коли ефект висить безпосередньо на global.stage (а не на проміжному
// пасивному акторі на кшталт Clutter.Clone) — юніформ текстури не завжди
// встигає коректно прив'язатись до потрібного texture unit, звідки й бралися
// спотворені кольори/чорні ділянки, які раніше маскували примусовим
// alpha = 1.0. Сніпет-підхід цієї проблеми не має, бо не робить власного
// семплу текстури.
const SHADER_DECL = `
uniform float sat_r;
uniform float sat_g;
uniform float sat_b;
`;

const SHADER_CODE = `
vec3 color = cogl_color_out.rgb;

float lum = dot(color, vec3(0.299, 0.587, 0.114));

vec3 result;
result.r = mix(lum, color.r, sat_r);
result.g = mix(lum, color.g, sat_g);
result.b = mix(lum, color.b, sat_b);

result = clamp(result, 0.0, 1.0);

cogl_color_out.rgb = result;
cogl_color_out.a = 1.0; // Примусова непрозорість для коректних скріншотів
`;

export const ChannelColorEffect = GObject.registerClass(
class ChannelColorEffect extends Shell.GLSLEffect {
    _init() {
        super._init();

        this._satRLoc = this.get_uniform_location('sat_r');
        this._satGLoc = this.get_uniform_location('sat_g');
        this._satBLoc = this.get_uniform_location('sat_b');

        this._values = {
            satR: 1.0, satG: 1.0, satB: 1.0,
        };

        this._pushUniforms();
    }

    setChannelValues(values) {
        Object.assign(this._values, values);
        this._pushUniforms();
        this.queue_repaint();
    }

    _pushUniforms() {
        this.set_uniform_float(this._satRLoc, 1, [this._values.satR]);
        this.set_uniform_float(this._satGLoc, 1, [this._values.satG]);
        this.set_uniform_float(this._satBLoc, 1, [this._values.satB]);
    }

    vfunc_build_pipeline() {
        const hook = Cogl.SnippetHook
            ? Cogl.SnippetHook.FRAGMENT
            : Shell.SnippetHook.FRAGMENT;
        this.add_glsl_snippet(hook, SHADER_DECL, SHADER_CODE, false);
    }
});