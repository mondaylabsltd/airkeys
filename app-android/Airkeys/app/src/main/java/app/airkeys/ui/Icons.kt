package app.airkeys.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/** Line icons on a 24-unit grid, drawn with a 1.8 stroke. */
object Icons {
    private fun icon(name: String, vararg paths: String) = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
        for (p in paths) {
            addPath(
                PathParser().parsePathString(p).toNodes(),
                stroke = SolidColor(Color.White),
                strokeLineWidth = 1.8f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
    }.build()

    val back = icon("back", "M15 5l-7 7 7 7")
    val forward = icon("forward", "M9 5l7 7-7 7")
    val scan = icon("scan", "M4 8V5a1 1 0 0 1 1-1h3", "M16 4h3a1 1 0 0 1 1 1v3", "M20 16v3a1 1 0 0 1-1 1h-3", "M8 20H5a1 1 0 0 1-1-1v-3", "M4 12h16")
    val code = icon("code", "M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h2v2h-2z", "M18 18h2v2h-2z", "M18 14h2", "M14 18h2")
    val lock = icon("lock", "M6 11h12v9H6z", "M8 11V8a4 4 0 0 1 8 0v3")
    val shield = icon("shield", "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z", "M9 12l2 2 4-4")
    val open = icon("open", "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z", "M12 9v4", "M12 16h.01")
    val warning = icon("warning", "M12 4l9 16H3z", "M12 10v4", "M12 17h.01")
    val check = icon("check", "M5 12.5l4.5 4.5L19 7.5")
    val airplane = icon("airplane", "M12 2.5c.9 0 1.5.9 1.5 2v5l7 4v2l-7-2v4.2l2 1.6V21L12 20l-3.5 1v-1.7l2-1.6v-4.2l-7 2v-2l7-4v-5c0-1.1.6-2 1.5-2z")
    val eye = icon("eye", "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z")
}
