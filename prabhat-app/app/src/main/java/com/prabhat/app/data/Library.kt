package com.prabhat.app.data

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import com.prabhat.app.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/**
 * The audio library. Imported files are copied into the app's own storage, so the mantra keeps playing
 * even if the original file is later moved or deleted from the phone.
 */
object Library {
    const val BUNDLED_ID = "bundled"
    private val BUNDLED_LYRICS = """
        ৰাতিপুৱা ৩ বাৰকৈ শুনক

        ওম মহালক্ষ্মী নম নমঃ
        ওম বিষ্ণুপ্রিয়ায় নম নমঃ
        ওম ধনপ্রদায়ে নম নমঃ
        ওম বিশ্বজনমে নম নমঃ

        🙏 ॐ 🙏
    """.trimIndent()

    private fun audioDir(c: Context) = File(c.filesDir, "audio").apply { mkdirs() }
    private fun coverDir(c: Context) = File(c.filesDir, "covers").apply { mkdirs() }

    fun uri(c: Context, m: Mantra): Uri =
        if (m.file.startsWith(ContentResolver.SCHEME_ANDROID_RESOURCE)) Uri.parse(m.file) else Uri.fromFile(File(m.file))

    fun isAvailable(m: Mantra): Boolean =
        m.file.startsWith(ContentResolver.SCHEME_ANDROID_RESOURCE) || File(m.file).let { it.isFile && it.length() > 0 }

    /** Adds the bundled mantra (res/raw/default_mantra) on first launch. */
    suspend fun seed(c: Context): Unit = withContext(Dispatchers.IO) {
        if (Store.value.seeded) return@withContext
        val mantra = bundled(c)
        Store.update { s ->
            if (s.seeded) s else s.copy(
                mantras = listOf(mantra) + s.mantras,
                defaultMantraId = s.defaultMantraId ?: mantra.id,
                seeded = true,
            )
        }
    }

    private fun bundled(c: Context): Mantra {
        val id = R.raw.default_mantra
        val duration = runCatching {
            c.resources.openRawResourceFd(id).use { fd ->
                MediaMetadataRetriever().run {
                    try { setDataSource(fd.fileDescriptor, fd.startOffset, fd.length); durationOf(this) } finally { release() }
                }
            }
        }.getOrDefault(0L)
        return Mantra(
            id = BUNDLED_ID,
            name = "Mahalakshmi Mantra",
            file = "${ContentResolver.SCHEME_ANDROID_RESOURCE}://${c.packageName}/$id",
            description = "Listen three times every morning.",
            lyrics = BUNDLED_LYRICS,
            durationMs = duration,
            builtIn = true,
            addedAt = System.currentTimeMillis(),
        )
    }

    /** Copies an audio file chosen by the user into the library. */
    suspend fun import(c: Context, source: Uri): Result<Mantra> = withContext(Dispatchers.IO) {
        runCatching {
            val name = displayName(c, source) ?: "Mantra"
            val ext = name.substringAfterLast('.', "").lowercase().takeIf { it.length in 2..4 } ?: "audio"
            val id = UUID.randomUUID().toString()
            val dest = File(audioDir(c), "$id.$ext")
            val stream = c.contentResolver.openInputStream(source) ?: error("The file could not be opened.")
            stream.use { input -> dest.outputStream().use { input.copyTo(it) } }
            val duration = MediaMetadataRetriever().run {
                try { setDataSource(dest.absolutePath); durationOf(this) } catch (e: Exception) { 0L } finally { release() }
            }
            if (duration <= 0) {
                dest.delete()
                error("This file doesn't look like a playable audio file. Try an MP3, M4A or WAV.")
            }
            val mantra = Mantra(
                id = id,
                name = name.substringBeforeLast('.').replace('_', ' ').trim().ifBlank { "Mantra" },
                file = dest.absolutePath,
                durationMs = duration,
                addedAt = System.currentTimeMillis(),
            )
            Store.update { s -> s.copy(mantras = s.mantras + mantra, defaultMantraId = s.defaultMantraId ?: mantra.id) }
            mantra
        }
    }

    /** Saves a cover image (scaled down) for a mantra. */
    suspend fun setCover(c: Context, mantraId: String, source: Uri): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            c.contentResolver.openInputStream(source)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= 1024 && bounds.outHeight / (sample * 2) >= 1024) sample *= 2
            val bmp = c.contentResolver.openInputStream(source)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            } ?: error("That image could not be opened.")
            val dest = File(coverDir(c), "$mantraId-${System.currentTimeMillis()}.jpg")
            dest.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 88, it) }
            bmp.recycle()
            var old: String? = null
            Store.update { s ->
                s.copy(mantras = s.mantras.map { if (it.id == mantraId) { old = it.cover; it.copy(cover = dest.absolutePath) } else it })
            }
            old?.let { File(it).delete() }
            Unit
        }
    }

    fun rename(id: String, name: String) = edit(id) { it.copy(name = name.trim().ifBlank { it.name }) }
    fun describe(id: String, text: String) = edit(id) { it.copy(description = text.trim()) }

    private fun edit(id: String, change: (Mantra) -> Mantra) =
        Store.update { s -> s.copy(mantras = s.mantras.map { if (it.id == id) change(it) else it }) }

    /** Removes a mantra and its files; schedules that used it fall back to the default mantra. */
    fun delete(id: String) {
        val m = Store.value.mantra(id) ?: return
        Store.update { s ->
            val rest = s.mantras.filter { it.id != id }
            s.copy(
                mantras = rest,
                defaultMantraId = if (s.defaultMantraId == id) rest.firstOrNull()?.id else s.defaultMantraId,
                schedules = s.schedules.map { if (it.mantraId == id) it.copy(mantraId = null) else it },
                resume = s.resume?.takeIf { it.mantraId != id },
            )
        }
        if (!m.file.startsWith(ContentResolver.SCHEME_ANDROID_RESOURCE)) File(m.file).delete()
        m.cover?.let { File(it).delete() }
    }

    private fun durationOf(r: MediaMetadataRetriever): Long =
        r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L

    private fun displayName(c: Context, uri: Uri): String? = runCatching {
        c.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment
}
