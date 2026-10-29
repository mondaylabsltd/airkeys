package app.airkeys.ui

import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import kotlin.math.abs

private const val VISIBLE = 5
private val ROW = 38.dp
private val GAP = 10.dp

/** The tick a picker gives for each value that passes (a segment of a continuous control). */
private val TICK = if (Build.VERSION.SDK_INT >= 34) HapticFeedbackConstants.SEGMENT_FREQUENT_TICK else HapticFeedbackConstants.CLOCK_TICK

/** Top and bottom fade out; the middle row stays whole. */
private val FADE = Brush.verticalGradient(
    0f to Color.Transparent,
    0.22f to Color.Black.copy(alpha = 0.3f),
    0.4f to Color.Black,
    0.6f to Color.Black,
    0.78f to Color.Black.copy(alpha = 0.3f),
    1f to Color.Transparent,
)

/**
 * A picker wheel, like the iOS timer's: [count] numbers from [first] on a drum, a haptic tick for
 * each one that passes the middle, and [onChosen] once the wheel comes to rest on another
 * number. A tap on a number turns the wheel to it. [unit] and the number sit together in the
 * band, centered ("Account 15", as the timer shows "15 min").
 */
@Composable
fun NumberWheel(value: Int, count: Int, onChosen: (Int) -> Unit, unit: String, modifier: Modifier = Modifier, first: Int = 0) {
    val rowPx = with(LocalDensity.current) { ROW.toPx() }
    val state = rememberLazyListState(initialFirstVisibleItemIndex = value)
    val scope = rememberCoroutineScope()
    val view = LocalView.current
    val current by rememberUpdatedState(value)
    val chosen by rememberUpdatedState(onChosen)

    /** Rows between an item's center and the wheel's middle (negative: above). */
    fun distance(index: Int): Float {
        val info = state.layoutInfo
        val item = info.visibleItemsInfo.firstOrNull { it.index == index } ?: return VISIBLE.toFloat()
        val middle = (info.viewportStartOffset + info.viewportEndOffset) / 2f
        return (item.offset + item.size / 2f - middle) / rowPx
    }
    val middle by remember {
        derivedStateOf { state.layoutInfo.visibleItemsInfo.minByOrNull { abs(distance(it.index)) }?.index ?: current }
    }
    LaunchedEffect(state) {
        snapshotFlow { middle }.drop(1).collect { view.performHapticFeedback(TICK) }
    }
    LaunchedEffect(state) {
        snapshotFlow { state.isScrollInProgress }.filter { !it }.collect { if (middle != current) chosen(middle) }
    }
    // the number can change from outside too
    LaunchedEffect(value) {
        if (!state.isScrollInProgress && middle != value) state.scrollToItem(value)
    }

    val number = Type.title.copy(fontSize = 26.sp, fontWeight = FontWeight.Normal, fontFeatureSettings = "tnum")
    Box(modifier.fillMaxWidth().height(ROW * VISIBLE).semantics { contentDescription = "$unit ${first + value}" }, contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxWidth().height(ROW).clip(RoundedCornerShape(10.dp)).background(Ink.raised.copy(alpha = 0.7f)))
        LazyColumn(
            state = state,
            flingBehavior = rememberSnapFlingBehavior(state, SnapPosition.Center),
            contentPadding = PaddingValues(vertical = ROW * (VISIBLE / 2)),
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                .drawWithContent {
                    drawContent()
                    drawRect(FADE, blendMode = BlendMode.DstIn)
                },
        ) {
            items(count) { i ->
                Halves(
                    Modifier
                        .height(ROW)
                        .clickable(remember { MutableInteractionSource() }, null) { scope.launch { state.animateScrollToItem(i) } }
                        .graphicsLayer {
                            // a drum: rows tilt away from the middle
                            val d = distance(i).coerceIn(-2.5f, 2.5f)
                            rotationX = -d * 18f
                            scaleX = 1f - abs(d) * 0.04f
                            scaleY = scaleX
                        },
                    end = {},
                    start = { Text("${first + i}", style = number) },
                )
            }
        }
        Halves(Modifier.height(ROW), end = { Text(unit, style = Type.body.copy(fontSize = 17.sp, fontWeight = FontWeight.Medium)) }, start = {})
    }
}

/** Two halves meeting at the center: the unit ends just left of it, the number starts just right. */
@Composable
private fun Halves(modifier: Modifier, end: @Composable () -> Unit, start: @Composable () -> Unit) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Half(Alignment.CenterEnd, end)
        Spacer(Modifier.width(GAP))
        Half(Alignment.CenterStart, start)
    }
}

@Composable
private fun RowScope.Half(alignment: Alignment, content: @Composable () -> Unit) {
    Box(Modifier.weight(1f).fillMaxSize(), contentAlignment = alignment) { content() }
}
