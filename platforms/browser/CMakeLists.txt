# SPDX-License-Identifier: GPL-3.0-or-later
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(AURORA_ENABLE_DVD OFF CACHE BOOL "" FORCE)
set(AURORA_ENABLE_CARD ON CACHE BOOL "" FORCE)
set(AURORA_ENABLE_THP ON CACHE BOOL "" FORCE)
set(AURORA_ENABLE_RMLUI OFF CACHE BOOL "" FORCE)
set(AURORA_CACHE_USE_ZSTD OFF CACHE BOOL "" FORCE)
set(AURORA_SDL3_PROVIDER vendor CACHE STRING "" FORCE)
add_compile_definitions(ENABLE_BACKEND_WEBGPU)
add_compile_options(--use-port=emdawnwebgpu -pthread)
add_link_options(--use-port=emdawnwebgpu -pthread -sALLOW_MEMORY_GROWTH=1 -sASYNCIFY=1)
add_subdirectory(${CMAKE_SOURCE_DIR}/extern/aurora ${CMAKE_BINARY_DIR}/aurora)
file(GLOB_RECURSE GAME_OBJECTS CONFIGURE_DEPENDS "${CMAKE_SOURCE_DIR}/build/browser/game/*.o")
set_source_files_properties(${GAME_OBJECTS} PROPERTIES EXTERNAL_OBJECT TRUE GENERATED TRUE)
add_executable(melee_browser ${GAME_OBJECTS}
 main.c dvd.c scheduler.c warmup.c presentation_globals.c presentation_memory.c
 ${CMAKE_SOURCE_DIR}/src/pc/audio.c
 ${CMAKE_SOURCE_DIR}/src/pc/discfont.c
 ${CMAKE_SOURCE_DIR}/src/pc/gx.c
 ${CMAKE_SOURCE_DIR}/src/pc/keyboard.c
 ${CMAKE_SOURCE_DIR}/src/pc/misc.c
 ${CMAKE_SOURCE_DIR}/src/pc/os.c
 ${CMAKE_SOURCE_DIR}/src/pc/thp.c
 ${CMAKE_SOURCE_DIR}/src/pc/vi.c
 ${CMAKE_SOURCE_DIR}/src/pc/widescreen.c)
target_include_directories(melee_browser PRIVATE ${CMAKE_SOURCE_DIR}/extern/aurora/include ${CMAKE_SOURCE_DIR}/src ${CMAKE_SOURCE_DIR}/src/sdk_include)
target_link_libraries(melee_browser PRIVATE aurora::core aurora::gx aurora::gd aurora::vi aurora::pad aurora::si aurora::mtx aurora::os aurora::card aurora::thp)
target_compile_options(melee_browser PRIVATE -Wno-incompatible-pointer-types -Wno-int-conversion)
target_link_options(melee_browser PRIVATE -O1 --profiling-funcs -sEMULATE_FUNCTION_POINTER_CASTS=1 -sSTACK_SIZE=8388608 -sINITIAL_MEMORY=268435456 -sMAXIMUM_MEMORY=2147483648 -sPTHREAD_POOL_SIZE=4 -sEXIT_RUNTIME=0 -sASSERTIONS=1 -lidbfs.js -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=callMain,FS,ENV -sINVOKE_RUN=0 -sASYNCIFY_IMPORTS=browser_disc_read,browser_upload_pools -sASYNCIFY_STACK_SIZE=1048576 -sERROR_ON_UNDEFINED_SYMBOLS=1)
set_target_properties(melee_browser PROPERTIES SUFFIX ".js")

# Keep the standalone validation server runnable from a clean build.
file(GLOB BROWSER_ASSETS CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/*.mjs" "${CMAKE_CURRENT_SOURCE_DIR}/*.html")
foreach(asset IN LISTS BROWSER_ASSETS)
  get_filename_component(name "${asset}" NAME)
  configure_file("${asset}" "${CMAKE_CURRENT_BINARY_DIR}/${name}" COPYONLY)
endforeach()
