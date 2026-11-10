#!/bin/bash
# Download Google Fonts as local woff2 files for 100% offline use
set -e
F=/home/z/my-project/kinostra-desktop/renderer/fonts
D=/home/z/my-project/kinostra-desktop/renderer/fonts/data
mkdir -p "$D"
cd /tmp

# Chrome UA to get woff2 format CSS
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

CSS_URL='https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Cinzel:wght@400;700;900&family=Bebas+Neue&family=Anton&family=Oswald:wght@400;600&family=Montserrat:wght@400;700;900&family=Jost:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Orbitron:wght@500;700;900&family=Michroma&family=Cormorant+Garamond:wght@500;700&display=swap'

curl -sL --retry 3 -A "$UA" -o fonts_raw.css "$CSS_URL"
echo "CSS size: $(wc -c < fonts_raw.css)"
