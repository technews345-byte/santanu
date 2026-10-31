package com.prabhat.app.data

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import androidx.annotation.DrawableRes
import androidx.annotation.RawRes
import com.prabhat.app.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/** One line of a mantra: where it starts in the audio, its original script, transliteration and meaning. */
class LyricLine(val startMs: Long, val text: String, val translit: String, val meaning: String)

/** A mantra shipped inside the app: its audio in res/raw and its picture in res/drawable-nodpi. */
class BuiltIn(
    val id: String,
    val name: String,
    @RawRes val audio: Int,
    /** Shown whole (never cropped) on every screen and in the playback notification. */
    @DrawableRes val art: Int,
    val description: String,
    /** Timed lines, highlighted in sync with the audio (each repetition starts again from the first line). */
    val lines: List<LyricLine> = emptyList(),
)

/**
 * The audio library. Imported files are copied into the app's own storage, so the mantra keeps playing
 * even if the original file is later moved or deleted from the phone.
 */
object Library {
    const val BUNDLED_ID = "bundled"
    private const val THEME_AUTO = "theme:auto"

    val BUILT_INS = listOf(
        BuiltIn(
            id = BUNDLED_ID,
            name = "Mahalakshmi Mantra",
            audio = R.raw.default_mantra,
            art = R.drawable.lakshmi,
            description = "Listen three times every morning.",
            lines = listOf(
                LyricLine(0, "ওম মহালক্ষ্মী নম নমঃ", "Om Mahālakṣmī Namo Namaḥ", "Salutations to Mahalakshmi, the great goddess of fortune."),
                LyricLine(4_100, "ওম বিষ্ণুপ্রিয়ায় নম নমঃ", "Om Viṣṇupriyāya Namo Namaḥ", "Salutations to the beloved of Lord Vishnu."),
                LyricLine(7_600, "ওম ধনপ্রদায়ে নম নমঃ", "Om Dhanapradāye Namo Namaḥ", "Salutations to her who bestows wealth."),
                LyricLine(11_100, "ওম বিশ্বজনমে নম নমঃ", "Om Viśvajaname Namo Namaḥ", "Salutations to the mother of the whole world."),
            ),
        ),
        BuiltIn(
            id = "hanuman-chalisa",
            name = "Shri Hanuman Chalisa",
            audio = R.raw.hanuman_chalisa,
            art = R.drawable.hanuman,
            description = "শ্ৰী হনুমান চালিশা · Shankar Mahadevan",
        ),
        BuiltIn(
            id = "krishna-mantra",
            name = "Krishnaya Vasudevaya",
            audio = R.raw.krishna_mantra,
            art = R.drawable.krishna,
            description = "Krishna mantra for peace, freedom from troubles and devotion.",
            lines = listOf(
                LyricLine(0, "কৃষ্ণায় বাসুদেৱায়", "Kṛṣṇāya Vāsudevāya", "To Krishna, son of Vasudeva,"),
                LyricLine(4_900, "হৰয়ে পৰমাত্মনে ।", "Haraye Paramātmane", "to Hari, the Supreme Soul;"),
                LyricLine(8_900, "প্ৰণতক্লেশনাশায়", "Praṇata-kleśa-nāśāya", "who ends the sorrows of all who bow to Him,"),
                LyricLine(12_900, "গোবিন্দায় নমো নমঃ ॥", "Govindāya Namo Namaḥ", "to Govinda, salutations again and again."),
            ),
        ),
    )

    /** Timed lines for a mantra, or empty (own mantras have plain words only). */
    fun lines(m: Mantra?): List<LyricLine> = builtIn(m?.id)?.lines.orEmpty()

    fun builtIn(id: String?): BuiltIn? = BUILT_INS.firstOrNull { it.id == id }

    /** Artwork: the built-in picture, else the Prabhat artwork (a user's own cover takes precedence where shown). */
    @DrawableRes
    fun artRes(m: Mantra?): Int = builtIn(m?.id)?.art ?: R.drawable.prabhat_art

    private fun audioDir(c: Context) = File(c.filesDir, "audio").apply { mkdirs() }
    private fun coverDir(c: Context) = File(c.filesDir, "covers").apply { mkdirs() }

    /** Built-in audio is looked up by its current resource, never a stored id (resource ids change between versions). */
    fun uri(c: Context, m: Mantra): Uri = builtIn(m.id)?.let { resourceUri(c, it.audio) }
        ?: if (m.file.startsWith(ContentResolver.SCHEME_ANDROID_RESOURCE)) Uri.parse(m.file) else Uri.fromFile(File(m.file))

    private fun resourceUri(c: Context, @RawRes id: Int) = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${c.packageName}/$id")

    fun isAvailable(m: Mantra): Boolean =
        m.file.startsWith(ContentResolver.SCHEME_ANDROID_RESOURCE) || File(m.file).let { it.isFile && it.length() > 0 }

    /**
     * Adds each built-in mantra once (also to existing installs when a new one ships). A built-in the user
     * deleted is remembered in [AppState.seededIds] and not brought back.
     */
    suspend fun seed(c: Context): Unit = withContext(Dispatchers.IO) {
        // Installs from before seededIds already had the first built-in mantra.
        val done = Store.value.seededIds + if (Store.value.seeded) setOf(BUNDLED_ID) else emptySet()
        val missing = BUILT_INS.filter { it.id !in done }
        // Default schedules that shipped after the user installed, added once (deleting them is respected).
        val newSchedules = AppState.DEFAULT_EXTRA_SCHEDULES.filter { "schedule:" + it.id !in done }
        // Built-ins already in the library pick up new audio (and its duration) shipped with an update.
        val updated = Store.value.mantras.mapNotNull { m -> builtIn(m.id)?.let { b -> toMantra(c, b) }?.takeIf { it.file != m.file || it.durationMs != m.durationMs } }
        if (updated.isNotEmpty()) {
            Store.update { s -> s.copy(mantras = s.mantras.map { m -> updated.firstOrNull { it.id == m.id }?.let { m.copy(file = it.file, durationMs = it.durationMs) } ?: m }) }
        }
        // One-time switch of existing installs to the sunrise/twilight theme introduced with it.
        val autoTheme = THEME_AUTO !in done
        if (missing.isEmpty() && newSchedules.isEmpty() && !autoTheme) return@withContext
        val added = missing.map { toMantra(c, it) }
        Store.update { s ->
            val have = s.mantras.map { it.id }.toSet()
            val fresh = added.filter { it.id !in have }
            val haveRules = s.schedules.map { it.id }.toSet()
            s.copy(
                mantras = s.mantras + fresh,
                schedules = s.schedules + newSchedules.filter { it.id !in haveRules },
                defaultMantraId = s.defaultMantraId ?: fresh.firstOrNull()?.id,
                seeded = true,
                seededIds = s.seededIds + done + missing.map { it.id } +
                    AppState.DEFAULT_EXTRA_SCHEDULES.map { "schedule:" + it.id } + THEME_AUTO,
                theme = if (autoTheme) ThemeMode.AUTO else s.theme,
            )
        }
    }

    private fun toMantra(c: Context, b: BuiltIn): Mantra {
        val duration = runCatching {
            c.resources.openRawResourceFd(b.audio).use { fd ->
                MediaMetadataRetriever().run {
                    try { setDataSource(fd.fileDescriptor, fd.startOffset, fd.length); durationOf(this) } finally { release() }
                }
            }
        }.getOrDefault(0L)
        return Mantra(
            id = b.id,
            name = b.name,
            file = resourceUri(c, b.audio).toString(),
            description = b.description,
            lyrics = b.lines.joinToString("\n") { it.text },
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
