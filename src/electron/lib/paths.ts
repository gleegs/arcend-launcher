import { app } from 'electron'
import path from 'node:path'

export const arcendDir = path.join(app.getPath('appData'), '.arcend')

export const configDir = path.join(arcendDir, 'config')
export const runtimeDir = path.join(arcendDir, 'runtime')
export const arcsDir = path.join(arcendDir, 'arcs')
export const cacheDir = path.join(arcendDir, 'cache')
export const remoteArcsCachePath = path.join(cacheDir, 'remote-arcs.json')
export const imagesCacheDir = path.join(cacheDir, 'images')

export const packwizDir = path.join(runtimeDir, 'packwiz')
export const javaRegistryPath = path.join(configDir, 'java.json')
export const packwizRegistryPath = path.join(configDir, 'packwiz.json')
export const arcRegistryPath = path.join(configDir, 'arcs.json')
export const mapRegistryPath = path.join(configDir, 'maps.json')
export const launcherConfigPath = configDir
