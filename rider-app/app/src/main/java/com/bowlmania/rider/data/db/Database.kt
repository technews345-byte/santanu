package com.bowlmania.rider.data.db

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert

/** Last server response per screen, so the rider still sees their orders and shift without signal. */
@Entity(tableName = "cache")
data class CacheEntry(@PrimaryKey val key: String, val json: String, val updatedAt: Long)

/** GPS points waiting to be uploaded (kept while the network is down, uploaded in order). */
@Entity(tableName = "location_queue")
data class QueuedLocation(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val lat: Double, val lng: Double, val accuracy: Float?, val speed: Float?, val heading: Float?,
    val timestamp: Long, val orderId: Int?,
)

@Dao
interface CacheDao {
    @Query("SELECT * FROM cache WHERE `key` = :key") suspend fun get(key: String): CacheEntry?
    @Upsert suspend fun put(entry: CacheEntry)
    @Query("DELETE FROM cache") suspend fun clear()
}

@Dao
interface LocationDao {
    @Insert suspend fun add(point: QueuedLocation)
    @Query("SELECT * FROM location_queue ORDER BY timestamp LIMIT :limit") suspend fun oldest(limit: Int): List<QueuedLocation>
    @Query("DELETE FROM location_queue WHERE id IN (:ids)") suspend fun delete(ids: List<Long>)
    @Query("SELECT COUNT(*) FROM location_queue") suspend fun count(): Int
    /** Keeps the queue bounded during long outages: the oldest points go first. */
    @Query("DELETE FROM location_queue WHERE id NOT IN (SELECT id FROM location_queue ORDER BY timestamp DESC LIMIT :keep)") suspend fun trim(keep: Int)
    @Query("DELETE FROM location_queue") suspend fun clear()
}

@Database(entities = [CacheEntry::class, QueuedLocation::class], version = 1, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun cache(): CacheDao
    abstract fun locations(): LocationDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "rider.db").fallbackToDestructiveMigration().build()
    }
}
