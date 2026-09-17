#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# يبني محرّك ‎3D Pinball – Space Cadet‎ إلى WebAssembly، فيُخرج cadet.js
# و cadet.wasm في جذر المستودع.
#
# المحرّك هندسة عكسية مفتوحة برخصة MIT:
#   https://github.com/k4zmu2a/SpaceCadetPinball     (المشروع الأصل)
#   https://github.com/alula/SpaceCadetPinball       (منفذ Emscripten)
#
# وموارد اللعبة ‎(PINBALL.DAT‎ والأصوات) ليست جزءاً من هذا البناء ولا من هذا
# المستودع: البناء هنا يحذف عمداً ‎--preload-file‎ من إعدادات المنفذ، فلا
# يُخبز فيه شيء منها. اللاعب يجلب نسخته هو، وتُركَّب في المتصفّح وقت التشغيل.
#
#   المتطلّبات: git, cmake, و emsdk ‎3.1.51‎ أو أحدث مُفعَّلاً في الصدفة.
#   الاستعمال:  bash src/cadet/build.sh
# ---------------------------------------------------------------------------
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="${CADET_WORK:-/tmp/cadet-build}"
SRC="$WORK/SpaceCadetPinball"

command -v emcc >/dev/null || { echo "emcc غير موجود — فعّل emsdk أولاً"; exit 1; }

mkdir -p "$WORK"
[ -d "$SRC" ] || git clone --depth 1 https://github.com/alula/SpaceCadetPinball.git "$SRC"

# لا تُخبز أي موارد في الملف الناتج، وأخرِج وحدة يتحكّم الغلاف في إقلاعها:
# ‎INVOKE_RUN=0‎ كي نكتب ملفّات اللاعب في ‎/game_resources/‎ قبل ‎main‎.
python3 - "$SRC/CMakeLists.txt" <<'PY'
import io, re, sys
f = sys.argv[1]; s = io.open(f, encoding='utf-8').read()
i = s.index('if(${CMAKE_SYSTEM_NAME} MATCHES "Emscripten")\n        target_link_libraries')
j = s.index('endif()', i) + len('endif()')
s = s[:i] + '''if(${CMAKE_SYSTEM_NAME} MATCHES "Emscripten")
        target_link_libraries(SpaceCadetPinball idbfs.js)
        set_target_properties(SpaceCadetPinball PROPERTIES LINK_FLAGS
        "-O2 -s ALLOW_MEMORY_GROWTH=1 -s FORCE_FILESYSTEM=1 -s MODULARIZE=1 \\
        -s EXPORT_NAME=CadetModule -s EXIT_RUNTIME=0 -s INVOKE_RUN=0 \\
        -s EXPORTED_RUNTIME_METHODS=['FS','callMain'] -s ENVIRONMENT=web --bind")
endif()''' + s[j:]
s = s.replace('set(CMAKE_EXECUTABLE_SUFFIX .html)', 'set(CMAKE_EXECUTABLE_SUFFIX .js)')
io.open(f, 'w', encoding='utf-8').write(s)
print('CMakeLists مهيّأ: بلا preload وبإقلاع مؤجَّل')
PY

rm -rf "$SRC/build" && mkdir -p "$SRC/build"
( cd "$SRC/build" && emcmake cmake -DCMAKE_BUILD_TYPE=Release .. && emmake make -j"$(nproc)" )

cp "$SRC/bin/SpaceCadetPinball.js"   "$REPO/cadet.js"
cp "$SRC/bin/SpaceCadetPinball.wasm" "$REPO/cadet.wasm"
cp "$SRC/LICENSE"                    "$REPO/cadet-LICENSE.txt"
ls -la "$REPO/cadet.js" "$REPO/cadet.wasm"
echo "تمّ. شغّل بعدها: python3 src/build.py"
