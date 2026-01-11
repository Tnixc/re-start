import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import fs from 'fs'
import { execSync } from 'child_process'
import path from 'path'

// Read version from manifest.json at build time
const manifest = JSON.parse(fs.readFileSync('./public/manifest.json', 'utf-8'))

// Plugin to inject theme data into HTML
function injectThemeScript() {
    return {
        name: 'inject-theme-script',
        transformIndexHtml(html) {
            const themesModule = fs.readFileSync('./src/lib/config/themes.js', 'utf-8')

            const themesMatch = themesModule.match(
                /export const themes = ({[\s\S]*?})\s*export const themeNames/
            )
            const defaultThemeMatch = themesModule.match(
                /export const defaultTheme = ['"](.+?)['"]/
            )

            if (!themesMatch || !defaultThemeMatch) {
                console.error('Failed to extract theme data')
                return html
            }

            return html
                .replace('__THEMES_DATA__', themesMatch[1])
                .replace('__DEFAULT_THEME__', defaultThemeMatch[1])
        },
    }
}

// Plugin to exclude manifest.json from public copy (we'll generate it separately)
function excludeManifest() {
    return {
        name: 'exclude-manifest',
        generateBundle(options, bundle) {
            // Remove manifest.json from bundle if Vite copied it
            delete bundle['manifest.json']
        },
    }
}

// Plugin to run build-manifest.js after each build (including in watch mode)
function buildManifest() {
    let outDir = 'dist/firefox'

    return {
        name: 'build-manifest',
        configResolved(config) {
            // Get the output directory from Vite config
            outDir = config.build.outDir
        },
        closeBundle() {
            // Detect browser from output directory
            const browser = outDir.includes('chrome') ? 'chrome' : 'firefox'

            try {
                execSync(`node scripts/build-manifest.js ${browser} ${outDir}`, {
                    stdio: 'inherit'
                })
            } catch (error) {
                console.error('Failed to build manifest:', error.message)
            }
        },
    }
}

// https://vite.dev/config/
export default defineConfig({
    base: './',
    plugins: [svelte(), injectThemeScript(), excludeManifest(), buildManifest()],
    define: {
        __APP_VERSION__: JSON.stringify(manifest.version),
    },
})
